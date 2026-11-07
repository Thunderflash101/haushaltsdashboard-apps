import asyncio
import json
import tempfile
import unittest
from datetime import datetime, date, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch
from aiohttp.test_utils import make_mocked_request
from server import make_app, TZ, SOURCES
from reminders import DEFAULTS, candidate, quiet_due, wall, write_reminders, lifecycle


def event(uid, title, start, end):
    key = 'dateTime' if 'T' in start else 'date'
    return dict(uid=uid, summary=title, start={key:start}, end={key:end})


class ReminderRules(unittest.TestCase):
    def test_waste_and_person_rules(self):
        waste = candidate(event('w','Restmüll','2026-11-10','2026-11-11'), SOURCES[2], DEFAULTS)
        self.assertEqual(waste['due'], '2026-11-09T18:00:00+01:00')
        self.assertEqual(waste['expires'], '2026-11-10T00:00:00+01:00')
        timed = event('a','Fußball','2026-11-10T16:00:00+01:00','2026-11-10T17:00:00+01:00')
        one = candidate(timed, SOURCES[0], DEFAULTS)
        two = candidate({**timed,'summary':'Neuer Titel'}, SOURCES[0], DEFAULTS)
        self.assertEqual(one['id'], two['id'], 'Stable UID avoids a second delivery after title edit')
        self.assertNotEqual(one['eventRevision'], two['eventRevision'])
        self.assertIsNone(candidate(event('d','Urlaub','2026-11-10','2026-11-11'), SOURCES[0], DEFAULTS))
        self.assertIsNone(candidate(timed, SOURCES[1], {**DEFAULTS,'joern':False}))
        self.assertIsNone(candidate(timed, SOURCES[3], DEFAULTS))
        self.assertIsNone(candidate({**timed,'status':'cancelled'}, SOURCES[0], DEFAULTS))

    def test_quiet_hours_and_dst(self):
        c = DEFAULTS
        self.assertEqual(quiet_due(datetime(2026,11,9,23,30,tzinfo=TZ),c), datetime(2026,11,10,7,tzinfo=TZ))
        self.assertEqual(quiet_due(datetime(2026,11,9,6,30,tzinfo=TZ),c), datetime(2026,11,9,7,tzinfo=TZ))
        self.assertEqual(wall(date(2026,3,29),'02:30').isoformat(), '2026-03-29T03:00:00+02:00')
        self.assertEqual(wall(date(2026,10,25),'02:30').fold,0)
        due=datetime(2026,10,25,2,15,tzinfo=TZ,fold=1)
        shifted=quiet_due(due,{**c,'quietEnd':'02:30'})
        self.assertGreaterEqual(shifted.timestamp(),due.timestamp(),'Quiet hours never shift back across DST fold')
        timed=event('dst','Zeitwechsel','2026-10-25T02:45:00+02:00','2026-10-25T02:15:00+01:00')
        item=candidate(timed,SOURCES[0],{**c,'quiet':False})
        self.assertEqual(item['originalDue'],'2026-10-25T02:15:00+02:00')


class ReminderApi(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.clock=datetime(2026,11,9,17,50,tzinfo=TZ)
        self.patcher=patch('reminders.now',side_effect=lambda:self.clock);self.patcher.start()
        self.ha=AsyncMock()
        self.events={SOURCES[0]['entity']:[event('t','Arzt','2026-11-10T09:00:00+01:00','2026-11-10T10:00:00+01:00')],
                     SOURCES[1]['entity']:[event('j','Fußball','2026-11-09T18:10:00+01:00','2026-11-09T19:00:00+01:00')],
                     SOURCES[2]['entity']:[event('w','Restmüll','2026-11-10','2026-11-11')]}
        async def load(entity,start,end):
            result=self.events.get(entity,[])
            if isinstance(result,Exception):raise result
            return result
        self.ha.events.side_effect=load
        self.ha.request.return_value=[dict(domain='notify',services={'mobile_app_test_phone':{'name':'Mobile App Testgerät'},'alexa_media':{'name':'Lautsprecher'}})]
        self.app=make_app(self.ha,':memory:');self.engine=self.app['reminders'];self.count=0
        await self.engine.refresh()

    async def asyncTearDown(self):
        self.app['db'].close();self.patcher.stop()

    async def write(self,data,key=None):
        self.count+=1
        req=make_mocked_request('POST','/api/reminders/actions',app=self.app,headers={'Idempotency-Key':key or 'reminder-test-request-%03d'%self.count})
        req.json=AsyncMock(return_value=data)
        response=await write_reminders(req)
        return response.status,json.loads(response.text)

    async def save(self,**changes):
        config,revision=self.engine.config()
        return await self.write(dict(action='settings',revision=revision,config={**config,**changes}))

    def live(self):
        config,revision=self.engine.config();config.update(enabled=True,targets=['mobile_app_test_phone'],activatedAt=self.clock.timestamp()-3600)
        with self.app['db']:
            self.app['db'].execute('UPDATE reminder_config SET data=? WHERE id=1',(json.dumps(config),))
            self.app['db'].execute('INSERT OR REPLACE INTO reminder_devices VALUES (?, ?, ?, ?)',('mobile_app_test_phone','proof',1,1))

    def row(self,source='joern'):
        return next(x for x in self.engine.snapshot()['items'] if x['source']==source)

    async def test_preview_never_sends_and_only_mobile_targets(self):
        await self.engine.deliver()
        self.ha.service.assert_not_called()
        data=self.engine.snapshot()
        self.assertFalse(data['config']['enabled']);self.assertEqual(len(data['items']),3)
        self.assertEqual([t['id'] for t in data['targets']],['mobile_app_test_phone'])
        self.assertEqual(self.row()['status'],'due')

    async def test_manual_test_confirmation_activation_and_no_old_backlog(self):
        status,_=await self.save(enabled=True,targets=['mobile_app_test_phone'])
        self.assertEqual(status,400)
        data=dict(action='test',target='mobile_app_test_phone')
        first=await self.write(data,'same-reminder-request-123')
        second=await self.write(data,'same-reminder-request-123')
        self.assertEqual(first,second);self.assertEqual(first[0],200);self.assertEqual(self.ha.service.await_count,1)
        self.assertEqual((await self.save(enabled=True,targets=['mobile_app_test_phone']))[0],400,'HA accepting test is not proof of device delivery')
        self.assertEqual((await self.write(dict(action='confirm-test',target=data['target'],testId=first[1]['testId'])))[0],200)
        self.assertEqual((await self.save(enabled=True,targets=[data['target']]))[0],200)
        await self.engine.refresh();await self.engine.deliver()
        self.assertEqual(self.ha.service.await_count,1,'No automatic backlog when enabling')
        self.clock=self.clock.replace(hour=18,minute=1)
        await self.engine.refresh();await self.engine.deliver()
        self.assertEqual(self.ha.service.await_count,2,'Newly due waste reminder can send')
        self.assertIn('Restmüll',self.ha.service.call_args.args[2]['message'])

    async def test_at_most_once_and_title_edit(self):
        self.live();await self.engine.deliver();await self.engine.deliver()
        self.assertEqual(self.ha.service.await_count,1)
        self.events[SOURCES[1]['entity']][0]['summary']='Fußball mit Freunden'
        await self.engine.refresh();await self.engine.deliver()
        self.assertEqual(self.ha.service.await_count,1)
        self.assertEqual(self.row()['title'],'Fußball mit Freunden')

    async def test_uncertain_send_not_repeated_and_crash_pending_preserved(self):
        self.live();self.ha.service.side_effect=TimeoutError()
        await self.engine.deliver();await self.engine.deliver()
        self.assertEqual(self.ha.service.await_count,1)
        self.assertEqual(self.row()['deliveries'][0]['status'],'uncertain')
        self.app['db'].execute("UPDATE reminder_deliveries SET status='pending'");self.app['db'].commit()
        ctx=lifecycle(self.app);await anext(ctx)
        self.assertEqual(self.app['db'].execute('SELECT status FROM reminder_deliveries').fetchone()[0],'uncertain')
        await ctx.aclose()
        await self.engine.deliver();self.assertEqual(self.ha.service.await_count,1)

    async def test_cancelled_offline_and_expired_events_do_not_send(self):
        self.live();self.events[SOURCES[1]['entity']]=TimeoutError()
        await self.engine.refresh();await self.engine.deliver()
        self.assertEqual(self.row()['status'],'stale');self.ha.service.assert_not_called()
        self.events[SOURCES[1]['entity']]=[]
        await self.engine.refresh();await self.engine.deliver()
        self.assertFalse(any(x['source']=='joern' for x in self.engine.snapshot()['items']))
        self.clock=self.clock.replace(hour=18,minute=11)
        self.events[SOURCES[1]['entity']]=[event('new','Zu spät','2026-11-09T18:10:00+01:00','2026-11-09T19:00:00+01:00')]
        await self.engine.refresh();await self.engine.deliver()
        self.assertFalse(any(x['source']=='joern' for x in self.engine.snapshot()['items']))
        self.assertTrue(all('Zu spät' not in c.args[2]['message'] for c in self.ha.service.call_args_list))

    async def test_snooze_dismiss_and_revision_conflict(self):
        self.live();await self.engine.deliver();item=self.row()
        payload=dict(action='snooze',id=item['id'],revision=item['revision'],minutes=10)
        self.assertEqual((await self.write(payload))[0],200)
        self.assertEqual(self.row()['status'],'snoozed')
        self.assertEqual((await self.write(payload))[0],409)
        self.clock=self.clock.replace(hour=18,minute=1)
        await self.engine.refresh();await self.engine.deliver();await self.engine.deliver()
        calls=[c for c in self.ha.service.call_args_list if 'Fußball' in c.args[2]['message']]
        self.assertEqual(len(calls),2,'One initial push and one explicitly requested snooze push')
        item=self.row();self.assertEqual((await self.write(dict(action='dismiss',id=item['id'],revision=item['revision'])))[0],200)
        self.assertEqual(self.row()['status'],'dismissed')

    async def test_quiet_hours_suppress_when_too_late_and_preferences_survive_restart(self):
        self.assertEqual((await self.save(quietStart='17:00',quietEnd='07:00'))[0],200)
        await self.engine.refresh();self.assertEqual(self.row()['status'],'suppressed')
        waste=self.row('waste');self.assertEqual(waste['status'],'suppressed')
        self.assertEqual((await self.save(quiet=False))[0],200)
        await self.engine.refresh();item=self.row()
        await self.write(dict(action='dismiss',id=item['id'],revision=item['revision']))
        with tempfile.TemporaryDirectory() as root:
            path=str(Path(root)/'reminders.sqlite');destination=__import__('sqlite3').connect(path)
            self.app['db'].backup(destination);destination.close()
            other=make_app(self.ha,path)
            try:
                await other['reminders'].refresh()
                self.assertFalse(other['reminders'].config()[0]['quiet'])
                self.assertTrue(any(x['id']==item['id'] and x['status']=='dismissed' for x in other['reminders'].snapshot()['items']))
            finally:other['db'].close()

    async def test_postponing_a_future_reminder_never_brings_it_forward(self):
        item=self.row('waste')
        self.assertEqual(item['due'],'2026-11-09T18:00:00+01:00')
        self.assertEqual((await self.write(dict(action='snooze',id=item['id'],revision=item['revision'],minutes=10)))[0],200)
        self.assertEqual(self.row('waste')['due'],'2026-11-09T18:10:00+01:00')

    async def test_snooze_is_elapsed_time_across_autumn_clock_change(self):
        self.clock=datetime(2026,10,25,2,55,tzinfo=TZ,fold=0)
        self.events[SOURCES[1]['entity']]=[event('fold','Zeitwechsel','2026-10-25T02:15:00+01:00','2026-10-25T03:30:00+01:00')]
        await self.save(quiet=False)
        await self.engine.refresh();item=self.row()
        result=await self.write(dict(action='snooze',id=item['id'],revision=item['revision'],minutes=10))
        self.assertEqual(result[0],200)
        self.assertEqual(self.row()['due'],'2026-10-25T02:05:00+01:00')

    async def test_invalid_actions_and_unsafe_targets(self):
        for data in [dict(action='test',target='alexa_media'),dict(action='confirm-test',target='mobile_app_test_phone',testId='forged'),dict(action='other')]:
            self.assertEqual((await self.write(data))[0],400)
        self.ha.service.assert_not_called()
        self.assertEqual((await self.save(leadMinutes=True))[0],400)
        self.assertEqual((await self.save(quietStart='24:00'))[0],400)

if __name__=='__main__':unittest.main()
