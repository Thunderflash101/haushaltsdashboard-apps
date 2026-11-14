"""Use HA's public OAuth helper, without exporting or copying Google credentials."""
import asyncio
import hashlib
import json
import re
from datetime import datetime
from urllib.parse import quote

from aiohttp import ClientError, ClientTimeout
from homeassistant.config_entries import ConfigEntryState
from homeassistant.helpers import config_entry_oauth2_flow, entity_registry

DOMAIN = 'familienkueche_calendar'
API = 'https://www.googleapis.com/calendar/v3/'
VERSION = '0.19.0'


class BridgeError(Exception):
    def __init__(self, message, status=503, uncertain=False):
        super().__init__(message)
        self.status, self.uncertain = status, uncertain


def source(hass, entity_id):
    registry = entity_registry.async_get(hass)
    entity = registry.async_get(entity_id)
    entry = hass.config_entries.async_get_entry(entity.config_entry_id) if entity and entity.config_entry_id else None
    state = hass.states.get(entity_id)
    if not entity or entity.platform != 'google' or not entry or entry.domain != 'google' or entity.disabled_by:
        raise BridgeError('Bitte einen vorhandenen Google-Kalender auswählen.', 400)
    if entry.state is not ConfigEntryState.LOADED or not state or state.state in ('unavailable','unknown'):
        raise BridgeError('Der Google-Kalender ist momentan nicht verfügbar. Google-Integration in HA prüfen.',503)
    if not int(state.attributes.get('supported_features',0)) & 1:
        raise BridgeError('Der Google-Kalender ist in Home Assistant nur lesbar.',403)
    # Google has used this registry identity since HA 2022.7. Fail closed if it changes.
    prefix = str(entry.unique_id or '') + '-'
    if not entry.unique_id or not entity.unique_id.startswith(prefix):
        raise BridgeError('Die Kalenderkennung dieser HA-Version wird nicht erkannt. Es wurde nichts geändert.', 409)
    calendar_id = entity.unique_id[len(prefix):]
    if not calendar_id or len(calendar_id) > 250 or re.search(r'[\s/\\?#]', calendar_id):
        raise BridgeError('Der Kalender kann nicht eindeutig zugeordnet werden.', 409)
    binding = hashlib.sha256(json.dumps([entry.entry_id, entity.unique_id, calendar_id]).encode()).hexdigest()
    return entry, calendar_id, binding


class Google:
    def __init__(self, hass, entity_id):
        self.hass, self.entity_id = hass, entity_id
        self.oauth = None
        self.entry_id = None

    async def request(self, method, suffix, *, params=None, body=None, etag=None, binding=None, calendar_list=False):
        entry, calendar, actual_binding = source(self.hass, self.entity_id)
        if binding is not None and binding != actual_binding:
            raise BridgeError('Die Kalenderzuordnung wurde geändert. Bitte den Termin neu öffnen.', 409)
        if self.oauth is None or self.entry_id != entry.entry_id:
            try:
                implementation = await config_entry_oauth2_flow.async_get_config_entry_implementation(self.hass, entry)
                self.oauth = config_entry_oauth2_flow.OAuth2Session(self.hass, entry, implementation)
                self.entry_id = entry.entry_id
            except Exception:
                raise BridgeError('Die vorhandene Google-Anmeldung ist nicht verfügbar. Google-Integration in HA prüfen.') from None
        path = ('users/me/calendarList/' if calendar_list else 'calendars/') + quote(calendar, safe='')
        if not calendar_list:
            path += '/' + suffix
        headers = {'If-Match': etag} if etag else {}
        try:
            response = await self.oauth.async_request(method, API+path, params=params, json=body,
                headers=headers, allow_redirects=False, timeout=ClientTimeout(total=12))
            async with response:
                status = response.status
                if status in (401,403):
                    raise BridgeError('Die bestehende Google-Anmeldung hat keine ausreichende Berechtigung. Google in HA erneut authentifizieren.',403)
                if status in (404,410,412):
                    raise BridgeError('Der Termin wurde inzwischen geändert oder entfernt. Bitte neu öffnen.',409)
                if status == 429:
                    raise BridgeError('Google begrenzt gerade die Anfragen. Bitte später erneut versuchen.',429)
                if not 200 <= status < 300:
                    raise BridgeError('Google hat keine sichere Antwort geliefert.',502,
                        uncertain=method=='PATCH' and (status==408 or status>=500 or 300<=status<400))
                raw=bytearray()
                async for chunk in response.content.iter_chunked(65536):
                    raw.extend(chunk)
                    if len(raw)>2_000_000:raise ValueError('Response too large')
                result=json.loads(raw)
                if not isinstance(result,dict):raise ValueError('Invalid response')
                return result
        except BridgeError:
            raise
        except (ClientError,OSError,asyncio.TimeoutError,ValueError):
            raise BridgeError('Keine sichere Google-Bestätigung. Kalender prüfen und Termin neu öffnen.' if method=='PATCH' else 'Google ist momentan nicht erreichbar.',
                              502,uncertain=method=='PATCH') from None
        except Exception:
            # OAuth helpers may raise HA-specific exceptions, possibly containing credentials.
            raise BridgeError('Die bestehende Google-Anmeldung ist momentan nicht verfügbar.',503,uncertain=method=='PATCH') from None

    async def info(self):
        result=await self.request('GET','',calendar_list=True)
        if result.get('accessRole')!='owner' or not isinstance(result.get('id'),str):
            raise BridgeError('Bitte einen eigenen Google-Kalender mit Eigentümerrecht verwenden.',403)
        return {'id':result['id'],'name':str(result.get('summary') or 'Google-Kalender')[:250]}

    async def events(self, params, binding):
        allowed={'iCalUID','timeMin','timeMax'}
        if not isinstance(params,dict) or set(params)-allowed or not all(isinstance(v,str) and len(v)<=1024 for v in params.values()):
            raise BridgeError('Ungültige Kalenderabfrage.',400)
        try:
            start=datetime.fromisoformat(params['timeMin'].replace('Z','+00:00'))
            end=datetime.fromisoformat(params['timeMax'].replace('Z','+00:00'))
            if start.tzinfo is None or end.tzinfo is None or not 0<(end-start).total_seconds()<=369*86400:raise ValueError()
        except (KeyError,ValueError,TypeError):
            raise BridgeError('Bitte einen begrenzten Kalenderzeitraum wählen.',400) from None
        rows=[];page=None
        for _ in range(3):
            result=await self.request('GET','events',binding=binding,params={**params,'singleEvents':'true','showDeleted':'false','maxResults':2500,**({'pageToken':page} if page else {})})
            if not isinstance(result.get('items'),list):raise BridgeError('Ungültige Google-Kalenderantwort.',502)
            rows.extend(result['items']);page=result.get('nextPageToken')
            if not page:return rows
        raise BridgeError('Zu viele Kalenderdaten. Zeitraum eingrenzen.',409)

    async def get(self, event_id, binding):
        if not isinstance(event_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,1024}',event_id):
            raise BridgeError('Ungültige Terminkennung.',400)
        return await self.request('GET','events/'+quote(event_id,safe=''),binding=binding)

    async def patch(self, event_id, patch, etag, binding):
        if not isinstance(patch,dict) or not patch or set(patch)-{'summary','location','description','start','end'}:
            raise BridgeError('Diese Terminänderung ist nicht erlaubt.',400)
        for field,limit in (('summary',200),('location',500),('description',10000)):
            if field in patch and (not isinstance(patch[field],str) or len(patch[field])>limit):
                raise BridgeError('Ein Terminfeld ist ungültig oder zu lang.',400)
        if 'summary' in patch and not patch['summary'].strip():raise BridgeError('Bitte einen Titel angeben.',400)
        if ('start' in patch)!=('end' in patch):raise BridgeError('Beginn und Ende müssen gemeinsam geändert werden.',400)
        if 'start' in patch:
            try:
                points=[];kinds=[]
                for field in ('start','end'):
                    boundary=patch[field]
                    if not isinstance(boundary,dict) or set(boundary)-{'date','dateTime','timeZone'}:raise ValueError()
                    all_day='date' in boundary
                    if all_day and 'dateTime' in boundary:raise ValueError()
                    value=datetime.fromisoformat(boundary['date'] if all_day else boundary['dateTime'].replace('Z','+00:00'))
                    if not all_day and value.tzinfo is None:raise ValueError()
                    points.append(value);kinds.append(all_day)
                if kinds[0]!=kinds[1] or not 0<(points[1]-points[0]).total_seconds()<=366*86400:raise ValueError()
            except (TypeError,ValueError,KeyError):raise BridgeError('Ungültiger Terminzeitraum.',400) from None
        if not isinstance(etag,str) or not re.fullmatch(r'"[^\x00-\x20\x7f"]{1,200}"',etag):
            raise BridgeError('Eine sichere Terminversion fehlt.',400)
        info=await self.info()
        current=await self.get(event_id,binding)
        if current.get('etag')!=etag:raise BridgeError('Der Termin wurde inzwischen geändert. Bitte neu öffnen.',409)
        organizer=current.get('organizer') or {}
        if current.get('status')=='cancelled' or current.get('recurrence') or current.get('eventType','default')!='default' or not(organizer.get('self') is True or organizer.get('email')==info['id']):
            raise BridgeError('Diesen Termin bitte in Google Kalender bearbeiten.',403)
        return await self.request('PATCH','events/'+quote(event_id,safe=''),binding=binding,body=patch,etag=etag,params={'sendUpdates':'none'})
