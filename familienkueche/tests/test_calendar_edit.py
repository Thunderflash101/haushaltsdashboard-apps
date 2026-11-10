import asyncio
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from aiohttp.test_utils import make_mocked_request

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import calendar_edit
import google_calendar
from google_calendar import GoogleError
from server import SOURCES, make_app, normalize_event


def google_event(**changes):
    result = dict(id='google123',iCalUID='stable@example.test',etag='"revision1"',summary='Fußball',
        start={'dateTime':'2026-11-10T16:00:30+01:00'},end={'dateTime':'2026-11-10T17:00:45+01:00'},
        location='Sportplatz',description='Schuhe mitbringen',organizer={'self':True,'email':'joern@example.test'},
        attendees=[{'email':'guest@example.test'}],reminders={'useDefault':False,'overrides':[{'method':'popup','minutes':10}]},
        conferenceData={'entryPoints':[{'uri':'https://meet.google.com/test'}]},status='confirmed')
    result.update(changes)
    return result


class FakeGoogle:
    calendar='primary'
    def __init__(self,event):
        self.event=copy.deepcopy(event)
        self.extra=[]
        self.patches=[]
        self.failure=None
    def status(self):
        return {'enabled':True,'configured':True,'calendarId':self.calendar,'scopes':list(google_calendar.SCOPES)}
    async def info(self):
        return {'id':'joern@example.test','name':'Jörn Testkalender'}
    async def events(self,params):
        return [copy.deepcopy(self.event)]+([] if 'iCalUID' in params else copy.deepcopy(self.extra))
    async def get(self,event_id):
        return copy.deepcopy(self.event)
    async def patch(self,event_id,body,etag):
        self.patches.append((event_id,copy.deepcopy(body),etag))
        if self.failure:
            raise self.failure
        if etag!=self.event['etag']:
            raise GoogleError('Changed',409)
        self.event.update(copy.deepcopy(body),etag='"revision2"')
        return copy.deepcopy(self.event)
    async def close(self):
        pass


class EditTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.ha=AsyncMock()
        self.original=google_event()
        self.ha_event={k:self.original[k] for k in ('summary','start','end','location','description')}
        self.ha_event['uid']=self.original['iCalUID']
        self.ha.events.return_value=[self.ha_event]
        self.app=make_app(self.ha,':memory:')
        self.client=FakeGoogle(self.original)
        self.app['google_calendar']=self.client
        self.editor=self.app['calendar_editor']
        rows=normalize_event(self.ha_event,SOURCES[1],calendar_edit.date(2026,11,10),calendar_edit.date(2026,11,11))
        self.query={'id':rows[0]['id'],'source':'joern','date':'2026-11-10'}
    def tearDown(self):
        self.app['db'].close()
    async def prepare(self,updates):
        opened=await self.editor.open(self.query)
        preview=await self.editor.preview({'session':opened['session'],'values':{**opened['values'],**updates}})
        return opened,preview
    async def test_open_is_read_only_and_resolves_ha_uid_not_client_google_id(self):
        opened=await self.editor.open(self.query)
        self.assertEqual(opened['values']['title'],'Fußball')
        self.assertTrue(opened['hasGuests'])
        self.assertEqual(self.client.patches,[])
        self.ha.create.assert_not_awaited()
        self.ha.service.assert_not_awaited()
        for query in ({**self.query,'source':'tina'},{**self.query,'id':'google123'},{**self.query,'id':'a'*24+'-2026-11-10'}):
            with self.assertRaises(GoogleError):await self.editor.open(query)
    async def test_title_patch_preserves_seconds_attendees_reminders_conference_and_semantic_dedup(self):
        _,preview=await self.prepare({'title':'Fußballtraining'})
        self.assertEqual(self.client.patches,[])
        for key in ('first-request-123456','second-request-123456'):
            result=await self.editor.save({'review':preview['review']},key)
            self.assertTrue(result['success'])
        self.assertEqual(len(self.client.patches),1)
        self.assertEqual(self.client.patches[0][1],{'summary':'Fußballtraining'})
        for key in ('start','end','attendees','reminders','conferenceData','iCalUID'):
            self.assertEqual(self.client.event[key],self.original[key])
        self.ha.service.assert_awaited_once_with('homeassistant','update_entity',{'entity_id':'calendar.joern'})
        self.ha.create.assert_not_awaited()
    async def test_move_changes_existing_id_with_if_match_and_exact_boundaries(self):
        _,preview=await self.prepare({'date':'2026-11-11','endDate':'2026-11-11','start':'18:00','end':'19:30','location':'Halle','description':'Neue Beschreibung'})
        result=await self.editor.save({'review':preview['review']},'valid-request-123456')
        self.assertTrue(result['success'])
        event_id,body,etag=self.client.patches[0]
        self.assertEqual(event_id,'google123')
        self.assertEqual(etag,'"revision1"')
        self.assertEqual(body['start'],{'dateTime':'2026-11-11T18:00:00+01:00','timeZone':'Europe/Berlin'})
        self.assertEqual(body['end']['dateTime'],'2026-11-11T19:30:00+01:00')
        self.assertNotIn('summary',body)
        self.assertEqual(self.client.event['id'],self.original['id'])
    async def test_all_day_last_day_is_inclusive(self):
        _,preview=await self.prepare({'allDay':True,'date':'2026-11-11','endDate':'2026-11-13'})
        await self.editor.save({'review':preview['review']},'valid-request-123456')
        self.assertEqual(self.client.event['start'],{'date':'2026-11-11'})
        self.assertEqual(self.client.event['end'],{'date':'2026-11-14'})
    async def test_noop_and_invalid_values_never_patch(self):
        opened=await self.editor.open(self.query)
        for changes in ({},{'title':''},{'end':'15:00'},{'date':'2026-03-29','endDate':'2026-03-29','start':'02:15','end':'03:30'},
                        {'date':'2026-10-25','endDate':'2026-10-25','start':'02:15','end':'03:30'},{'endDate':'2028-01-01'}):
            with self.assertRaises((GoogleError,ValueError)):
                await self.editor.preview({'session':opened['session'],'values':{**opened['values'],**changes}})
        self.assertEqual(self.client.patches,[])
    async def test_preview_and_commit_conflicts_refuse_overwrite(self):
        opened=await self.editor.open(self.query)
        self.client.event['etag']='"other"'
        with self.assertRaises(GoogleError):await self.editor.preview({'session':opened['session'],'values':{**opened['values'],'title':'Neu'}})
        self.client.event['etag']='"revision1"'
        preview=await self.editor.preview({'session':opened['session'],'values':{**opened['values'],'title':'Neu'}})
        self.client.event['etag']='"other"'
        with self.assertRaises(GoogleError):await self.editor.save({'review':preview['review']},'valid-request-123456')
        self.assertEqual(self.client.patches,[])
    async def test_atomic_google_conflict_and_definite_rejection_do_not_leave_pending(self):
        _,preview=await self.prepare({'title':'Neu'})
        self.client.failure=GoogleError('Precondition failed',409)
        with self.assertRaises(GoogleError):await self.editor.save({'review':preview['review']},'valid-request-123456')
        self.assertEqual(self.app['db'].execute("SELECT COUNT(*) FROM submissions WHERE key LIKE 'gcal-%'").fetchone()[0],0)
    async def test_uncertain_write_blocks_new_keys_and_different_patch_on_same_revision(self):
        _,preview=await self.prepare({'title':'Neu'})
        self.client.failure=GoogleError('Timeout',502,uncertain=True)
        for key in ('first-request-123456','second-request-123456'):
            with self.assertRaises(GoogleError) as raised:await self.editor.save({'review':preview['review']},key)
            self.assertTrue(raised.exception.uncertain)
        # A new editor after an app restart loses sessions, but not the DB receipt.
        self.editor=calendar_edit.Editor(self.app)
        self.app['calendar_editor']=self.editor
        _,other=await self.prepare({'location':'Anderer Ort'})
        with self.assertRaises(GoogleError):await self.editor.save({'review':other['review']},'third-request-123456')
        self.assertEqual(len(self.client.patches),1)
    async def test_google_confirmation_mismatch_is_uncertain(self):
        _,preview=await self.prepare({'title':'Neu'})
        self.client.patch=AsyncMock(return_value=self.original)
        with self.assertRaises(GoogleError) as raised:await self.editor.save({'review':preview['review']},'valid-request-123456')
        self.assertTrue(raised.exception.uncertain)
        self.assertEqual(self.app['db'].execute("SELECT status FROM submissions WHERE key LIKE 'gcal-%'").fetchone()[0],'pending')
    async def test_overlap_warning_excludes_adjacent_all_day_and_self(self):
        self.client.extra=[google_event(id='overlap',summary='Arzt'),
            google_event(id='adjacent',start={'dateTime':'2026-11-10T17:00:45+01:00'},end={'dateTime':'2026-11-10T18:00:00+01:00'}),
            google_event(id='full',start={'date':'2026-11-10'},end={'date':'2026-11-11'})]
        _,preview=await self.prepare({'title':'Neu'})
        self.assertEqual(preview['conflictCount'],1)
        self.assertEqual(preview['conflicts'][0]['title'],'Arzt')
        self.assertEqual(self.client.patches,[])
    async def test_single_recurring_occurrence_not_master_and_foreign_organizer(self):
        self.original['recurringEventId']='master'
        self.ha_event['recurrence_id']='google123'
        self.client.event=self.original
        rows=normalize_event(self.ha_event,SOURCES[1],calendar_edit.date(2026,11,10),calendar_edit.date(2026,11,11))
        self.query['id']=rows[0]['id']
        opened,preview=await self.prepare({'title':'Einmal anders'})
        self.assertTrue(opened['recurring']);self.assertTrue(preview['recurring'])
        await self.editor.save({'review':preview['review']},'valid-request-123456')
        self.assertEqual(self.client.patches[0][0],'google123')
        self.client.event['organizer']={'email':'foreign@example.test'}
        with self.assertRaises(GoogleError):await self.editor.open(self.query)
    async def test_stale_or_ambiguous_google_mapping_is_never_editable(self):
        self.client.event['start']={'dateTime':'2026-11-10T15:00:00+01:00'}
        with self.assertRaises(GoogleError):await self.editor.open(self.query)
        self.client.event=copy.deepcopy(self.original)
        self.client.events=AsyncMock(return_value=[self.original,copy.deepcopy(self.original)])
        with self.assertRaises(GoogleError):await self.editor.open(self.query)
    async def test_expiry_and_changed_target_refuse_save(self):
        _,preview=await self.prepare({'title':'Neu'})
        self.client.calendar='another@example.test'
        with self.assertRaises(GoogleError):await self.editor.save({'review':preview['review']},'valid-request-123456')
        self.client.calendar='primary'
        self.editor.reviews[preview['review']]['expires']=0
        with self.assertRaises(GoogleError):await self.editor.save({'review':preview['review']},'valid-request-123456')
        self.assertEqual(self.client.patches,[])
    async def test_failed_ha_refresh_does_not_undo_confirmed_google_save(self):
        self.ha.service.side_effect=RuntimeError('offline')
        _,preview=await self.prepare({'title':'Neu'})
        result=await self.editor.save({'review':preview['review']},'valid-request-123456')
        self.assertTrue(result['success']);self.assertTrue(result['warning'])


class CredentialTests(unittest.TestCase):
    def test_named_secrets_only_and_no_parser_leaks(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'secrets.yaml'
            path.write_text('familienkueche_google_client_id: "123-test.apps.googleusercontent.com"\nfamilienkueche_google_client_secret: "GOCSPX-test-secret"\nfamilienkueche_google_refresh_token: "1//test-refresh-token"\nother: "not forwarded"\n')
            result=google_calendar.read_credentials(path)
            self.assertEqual(set(result),{'client_id','client_secret','refresh_token'})
            self.assertNotIn('other',result)
            path.write_text('invalid: [secret-not-for-errors')
            self.assertIsNone(google_calendar.read_credentials(path))
            path.write_text('x'*1_000_001)
            self.assertIsNone(google_calendar.read_credentials(path))
    def test_disabled_status_never_reads_secrets(self):
        client=google_calendar.GoogleCalendar({})
        with patch.object(google_calendar,'read_credentials',side_effect=AssertionError('No secret read')):
            self.assertEqual(client.status()['configured'],False)


class Response:
    def __init__(self,status,payload):
        self.status=status
        self.payload=json.dumps(payload).encode()
        self.content=self
    async def __aenter__(self):return self
    async def __aexit__(self,*args):pass
    async def iter_chunked(self,size):
        # A real HTTP stream may return less than the requested size per read.
        for start in range(0,len(self.payload),7):yield self.payload[start:start+7]


class Transport:
    def __init__(self,responses):self.responses=list(responses);self.calls=[]
    def request(self,method,url,**kwargs):
        self.calls.append((method,url,kwargs))
        result=self.responses.pop(0)
        if isinstance(result,Exception):raise result
        return result
    def post(self,url,**kwargs):return self.request('POST',url,**kwargs)
    async def close(self):pass


class GoogleTransportTests(unittest.IsolatedAsyncioTestCase):
    def client(self,responses):
        client=google_calendar.GoogleCalendar({'google_calendar_edit_enabled':True,'google_calendar_edit_id':'own@example.test'})
        client.session=Transport(responses)
        return client
    async def test_offline_refresh_once_google_only_headers_and_atomic_patch(self):
        credentials={'client_id':'own-client.apps.googleusercontent.com','client_secret':'secret-test-only','refresh_token':'1//refresh-test-only'}
        client=self.client([Response(200,{'access_token':'access-token-test-only','expires_in':3600}),
                            Response(200,{'id':'event1','etag':'"version2"'}),Response(200,{'id':'event1'})])
        with patch.object(google_calendar,'read_credentials',return_value=credentials):
            await client.patch('event1',{'summary':'Neu'},'"version1"')
            await client.get('event1')
        self.assertEqual([c[0] for c in client.session.calls],['POST','PATCH','GET'])
        auth,mutation,read=client.session.calls
        self.assertEqual(auth[1],google_calendar.TOKEN_URL)
        self.assertEqual(auth[2]['data']['grant_type'],'refresh_token')
        self.assertNotIn('headers',auth[2])
        self.assertEqual(mutation[1],'https://www.googleapis.com/calendar/v3/calendars/own%40example.test/events/event1')
        self.assertEqual(mutation[2]['headers'],{'Authorization':'Bearer access-token-test-only','If-Match':'"version1"'})
        self.assertEqual(mutation[2]['params'],{'sendUpdates':'none'})
        self.assertTrue(all(c[2]['allow_redirects'] is False for c in client.session.calls))
        self.assertNotIn('refresh_token',json.dumps(mutation[2]))
    async def test_patch_failure_classification_no_retries_and_no_error_body_leaks(self):
        for status,uncertain in ((412,False),(403,False),(429,False),(408,True),(500,True),(302,True)):
            client=self.client([Response(status,{'error':'secret-provider-message-not-for-browser'})])
            client.token='cached-access-token';client.expires=calendar_edit.monotime.monotonic()+100
            with self.assertRaises(GoogleError) as raised:await client.patch('event1',{'summary':'Neu'},'"v1"')
            self.assertEqual(raised.exception.uncertain,uncertain)
            self.assertNotIn('secret-provider',str(raised.exception))
            self.assertEqual(len(client.session.calls),1)
        client=self.client([asyncio.TimeoutError()]);client.token='cached-access-token';client.expires=calendar_edit.monotime.monotonic()+100
        with self.assertRaises(GoogleError) as raised:await client.patch('event1',{'summary':'Neu'},'"v1"')
        self.assertTrue(raised.exception.uncertain)
    async def test_non_owned_calendar_is_refused_and_pagination_is_bounded(self):
        client=self.client([Response(200,{'accessRole':'writer','id':'other'})]);client.token='cached-access-token';client.expires=calendar_edit.monotime.monotonic()+100
        with self.assertRaises(GoogleError):await client.info()
        client=self.client([Response(200,{'items':[],'nextPageToken':'more'}) for _ in range(3)])
        client.token='cached-access-token';client.expires=calendar_edit.monotime.monotonic()+100
        with self.assertRaises(GoogleError):await client.events({'singleEvents':'true'})
        self.assertEqual(len(client.session.calls),3)


if __name__=='__main__':unittest.main()
