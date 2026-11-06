import asyncio
import json
import sys
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import AsyncMock
from aiohttp.test_utils import make_mocked_request
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import SOURCES, normalize_event, validated_window, validate_create, ingress_only, make_app, create_event, calendar

class NormalizationTests(unittest.TestCase):
    def event(self, start, end):
        return {'start': start, 'end': end, 'summary': '<script>Termin</script>', 'uid': 'example'}

    def test_all_day_exclusive_end_and_clipping(self):
        e=self.event({'date':'2028-02-28'},{'date':'2028-03-02'})
        rows=normalize_event(e,SOURCES[0],date(2028,2,29),date(2028,3,2))
        self.assertEqual([r['date'] for r in rows],['2028-02-29','2028-03-01'])
        self.assertTrue(all(r['allDay'] and r['person']=='tina' and not r['isWaste'] for r in rows))

    def test_utc_conversion_and_midnight(self):
        e=self.event({'dateTime':'2026-07-01T21:00:00Z'},{'dateTime':'2026-07-02T00:30:00Z'})
        rows=normalize_event(e,SOURCES[1],date(2026,7,1),date(2026,7,3))
        self.assertEqual([(r['start'],r['end']) for r in rows],[('23:00','24:00'),('00:00','02:30')])
        self.assertNotEqual(rows[0]['id'],rows[1]['id'])
        e['end']={'dateTime':'2026-07-01T22:00:00Z'}
        self.assertEqual(len(normalize_event(e,SOURCES[1],date(2026,7,1),date(2026,7,3))),1)

    def test_waste_identity(self):
        rows=normalize_event(self.event({'date':'2026-11-10'},{'date':'2026-11-11'}),SOURCES[2],date(2026,11,1),date(2026,12,1))
        self.assertTrue(rows[0]['isWaste']);self.assertEqual(rows[0]['person'],'alle')

    def test_window_limit(self):
        for q in [{'start':'2026-01-01','end':'2027-01-01'}, {'start':'2026-02-30','end':'2026-03-01'}]:
            with self.assertRaises(ValueError):validated_window(q)

    def test_write_validation_and_dst(self):
        data={'title':'Fußball','date':'2026-11-10','person':'joern','start':'16:00','end':'17:30','allDay':False}
        self.assertEqual(validate_create(data)['start_date_time'],'2026-11-10T16:00:00+01:00')
        for update in [{'person':'tina'},{'date':'2026-03-29','start':'02:15','end':'03:30'},{'date':'2026-10-25','start':'02:15','end':'03:30'},{'end':'15:00'}]:
            with self.assertRaises(ValueError):validate_create({**data,**update})
        self.assertEqual(validate_create({**data,'allDay':True})['end_date'],'2026-11-11')

class ApiTests(unittest.IsolatedAsyncioTestCase):
    def request(self, app, body, key='example-request-12345'):
        req=make_mocked_request('POST','/api/events',headers={'Idempotency-Key':key},app=app)
        req.json=AsyncMock(return_value=body)
        return req

    async def test_ingress_rejects_forged_forwarded_header(self):
        from aiohttp import web
        req=make_mocked_request('GET','/',headers={'X-Forwarded-For':'172.30.32.2'})
        with self.assertRaises(web.HTTPForbidden):await ingress_only(req,AsyncMock())

    async def test_idempotency_and_ambiguous_write(self):
        ha=AsyncMock();ha.features.return_value=3
        app=make_app(ha,':memory:')
        data={'title':'Test','date':'2026-11-10','person':'joern','start':'16:00','end':'17:30','allDay':False}
        for _ in range(2):
            response=await create_event(self.request(app,data));self.assertEqual(response.status,200)
        self.assertEqual(ha.create.await_count,1)
        response=await create_event(self.request(app,{**data,'title':'Different'}));self.assertEqual(response.status,409)
        ha.create.side_effect=asyncio.TimeoutError()
        response=await create_event(self.request(app,data,'second-request-12345'));self.assertEqual(response.status,502)
        response=await create_event(self.request(app,data,'second-request-12345'));self.assertEqual(response.status,409)
        self.assertEqual(ha.create.await_count,2)
        app['db'].close()

    async def test_partial_read_keeps_other_sources(self):
        from server import UpstreamError
        ha=AsyncMock();ha.features.return_value=3
        async def events(entity,start,end):
            if entity==SOURCES[0]['entity']:raise UpstreamError('offline')
            return [{'summary':'Test','start':{'date':'2026-11-10'},'end':{'date':'2026-11-11'}}]
        ha.events.side_effect=events
        app=make_app(ha,':memory:')
        req=make_mocked_request('GET','/api/calendar?start=2026-11-01&end=2026-12-01',app=app)
        response=await calendar(req);data=json.loads(response.text)
        self.assertEqual([s['ok'] for s in data['sources']],[False,True,True,True,True])
        self.assertEqual(len(data['sources'][1]['events']),1)
        self.assertTrue(data['sources'][1]['canCreate']);self.assertFalse(data['sources'][2]['canCreate'])
        app['db'].close()

if __name__=='__main__':unittest.main()
