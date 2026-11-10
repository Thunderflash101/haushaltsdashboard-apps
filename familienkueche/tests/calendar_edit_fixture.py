"""Loopback test only: synthetic HA events and in-memory Google PATCH responses."""
import asyncio
import copy
import json
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

from aiohttp import web

from test_calendar_edit import FakeGoogle, google_event
from google_calendar import GoogleError
from server import make_app, TZ


class HA:
    def __init__(self,client,day):self.client,self.day=client,day
    async def events(self,entity,start,end):
        if entity=='calendar.joern':
            e=self.client.event
            return [{k:e[k] for k in ('summary','start','end','location','description')}|{'uid':e['iCalUID']}]
        if entity=='calendar.tina':
            return [{'uid':'tina-test','summary':'Tinas Termin','start':{'dateTime':self.day+'T10:00:00+01:00'},'end':{'dateTime':self.day+'T11:00:00+01:00'}}]
        return []
    async def features(self,entity):return 3
    async def service(self,domain,name,payload,**kwargs):
        if (domain,name)==('homeassistant','update_entity'):return []
        raise RuntimeError('No actual service calls in fixture')
    async def request(self,*args,**kwargs):raise RuntimeError('No actual external API in fixture')


async def main():
    day=datetime.now(TZ).date()
    event=google_event(start={'dateTime':day.isoformat()+'T16:00:30+01:00'},end={'dateTime':day.isoformat()+'T17:00:45+01:00'})
    client=FakeGoogle(event)
    future=(day+timedelta(days=1)).isoformat()
    client.extra=[google_event(id='overlap',summary='Zweiter Termin',start={'dateTime':future+'T16:45:00+01:00'},end={'dateTime':future+'T17:15:00+01:00'})]
    with tempfile.TemporaryDirectory(prefix='calendar-edit-browser-') as root:
        app=make_app(HA(client,day.isoformat()),str(Path(root)/'fixture.sqlite'))
        app['google_calendar']=client
        async def state(request):return web.json_response({'patches':len(client.patches),'event':client.event})
        async def conflict(request):
            client.event['etag']='"external-change"'
            client.event['summary']='Anderweitig bearbeitet'
            return web.json_response({'success':True})
        async def uncertain(request):
            client.failure=GoogleError('Speicherstatus unklar. Google Kalender prüfen.',502,uncertain=True)
            return web.json_response({'success':True})
        app.router.add_get('/fixture/state',state)
        app.router.add_get('/fixture/conflict',conflict)
        app.router.add_get('/fixture/uncertain',uncertain)
        app.middlewares.clear()
        runner=web.AppRunner(app,access_log=None)
        await runner.setup()
        site=web.TCPSite(runner,'127.0.0.1',0)
        await site.start()
        print(json.dumps({'port':site._server.sockets[0].getsockname()[1],'day':day.isoformat()}),flush=True)
        try:await asyncio.Event().wait()
        finally:await runner.cleanup()


if __name__=='__main__':asyncio.run(main())
