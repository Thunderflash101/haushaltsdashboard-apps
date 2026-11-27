"""Prefer the HA Google bridge; keep explicitly configured direct OAuth working."""
import asyncio

from aiohttp import web

from bridge_package import DOMAIN, bridge_package
from google_calendar import GoogleCalendar, GoogleError

async def package(request):
    return web.Response(body=bridge_package(),content_type='application/zip',
        headers={'Content-Disposition':'attachment; filename="familienkueche-calendar.zip"'})


class BridgeGoogle:
    def __init__(self,ha,entity):
        self.ha,self.entity=ha,entity
        self.calendar='ha:'+entity
        self.binding=None
    async def call(self,operation,**data):
        try:
            result=await asyncio.wait_for(self.ha.service(DOMAIN,'request',{'entity_id':self.entity,'operation':operation,**({'binding':self.binding} if operation!='status' else {}),**data},response=True),55 if operation=='patch' else 52)
        except Exception:
            raise GoogleError('Die Kalendererweiterung in Home Assistant ist nicht erreichbar. Verbindung prüfen.',503,uncertain=operation=='patch') from None
        if not isinstance(result,dict) or result.get('success') is not True:
            error=result if isinstance(result,dict) else {}
            raise GoogleError(error.get('error') or 'Ungültige Antwort der Kalendererweiterung.',
                error.get('status') if error.get('status') in (400,403,409,429,502,503) else 503,
                uncertain=operation=='patch' and error.get('uncertain') is not False)
        return result
    async def status(self):
        try:
            result=await asyncio.wait_for(self.ha.service(DOMAIN,'request',{'entity_id':self.entity,'operation':'status'},response=True),3)
        except Exception:
            return {'available':False,'configured':False}
        result=result if isinstance(result,dict) else {}
        if result.get('protocol')==1 and result.get('success') is True and result.get('configured') is True and isinstance(result.get('binding'),str) and len(result['binding'])==64:
            self.binding=result['binding']
            self.calendar='ha:'+self.entity+':'+self.binding
            return {'available':True,'configured':True,'calendarId':result.get('calendarId'),'version':result.get('version')}
        return {'available':True,'configured':False,'error':result.get('error') or 'Bitte die Kalendererweiterung aktualisieren und den Kalender verbinden.'}
    async def info(self):return (await self.call('info'))['result']
    async def events(self,params):return (await self.call('events',params={k:v for k,v in params.items() if k in ('iCalUID','timeMin','timeMax')}))['result']
    async def get(self,event_id):return (await self.call('get',event_id=event_id))['result']
    async def patch(self,event_id,body,etag):return (await self.call('patch',event_id=event_id,patch=body,etag=etag))['result']


class Connection:
    def __init__(self,app,options):
        self.bridge=BridgeGoogle(app['ha'],app['sources'][1]['entity'])
        self.direct=GoogleCalendar(options)
        self.active=None
    @property
    def calendar(self):return self.active.calendar if self.active else 'unconfigured'
    async def status(self):
        state=await self.bridge.status()
        if state.get('configured'):
            self.active=self.bridge
            return {**state,'mode':'homeassistant','enabled':True,'scopes':[]}
        direct=self.direct.status()
        if direct['configured']:
            self.active=self.direct
            return {**direct,'mode':'direct','available':state['available']}
        self.active=None
        return {**state,'enabled':True,'mode':'setup','scopes':[]}
    async def selected(self):
        if self.active is None:
            if not (await self.status())['configured']:
                raise GoogleError('Bitte die Erweiterung Familienküche Kalender in Home Assistant installieren und den vorhandenen Google-Kalender auswählen.',503)
        return self.active
    async def info(self):return await (await self.selected()).info()
    async def events(self,params):return await (await self.selected()).events(params)
    async def get(self,event_id):return await (await self.selected()).get(event_id)
    async def patch(self,event_id,body,etag):return await (await self.selected()).patch(event_id,body,etag)
    async def close(self):await self.direct.close()
