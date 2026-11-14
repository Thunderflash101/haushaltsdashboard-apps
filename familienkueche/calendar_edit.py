"""Read/preview/CAS-update a single Jörn occurrence. Never delete/recreate events."""
import asyncio
import hashlib
import json
import re
import secrets
import time as monotime
import inspect
from datetime import date, datetime, time, timedelta

from aiohttp import web

from google_calendar import GoogleCalendar, GoogleError
from server import TZ, UpstreamError, normalize_event, parse_boundary


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def bounds(event):
    start, all_day = parse_boundary(event['start'])
    end, end_all_day = parse_boundary(event['end'])
    if all_day != end_all_day or end <= start:
        raise ValueError('Invalid event bounds')
    return start, end, all_day


def values(event):
    start, end, all_day = bounds(event)
    return {'title': event.get('summary') or 'Ohne Titel', 'date': start.date().isoformat(),
            'endDate': (end.date() - timedelta(days=1) if all_day else end.date()).isoformat(),
            'start': start.strftime('%H:%M'), 'end': end.strftime('%H:%M'), 'allDay': all_day,
            'location': event.get('location') or '', 'description': event.get('description') or ''}


def validate_values(data):
    if not isinstance(data, dict) or type(data.get('allDay')) is not bool:
        raise ValueError('Bitte gültige Termindaten angeben.')
    clean = {'allDay': data['allDay']}
    for key, limit in (('title', 200), ('location', 500), ('description', 10000)):
        value = data.get(key, '')
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError('Titel, Ort oder Beschreibung ist zu lang.')
        clean[key] = value.strip() if key == 'title' else value
    if not clean['title']:
        raise ValueError('Bitte einen Titel angeben.')
    for key in ('date', 'endDate'):
        clean[key] = date.fromisoformat(data[key]).isoformat()
    if not 0 <= (date.fromisoformat(clean['endDate'])-date.fromisoformat(clean['date'])).days <= 365:
        raise ValueError('Bitte einen Zeitraum von höchstens 366 Tagen wählen.')
    if clean['allDay']:
        # Use the same normal form for preview/save equality.
        clean['start'], clean['end'] = '00:00', '00:00'
    else:
        for key in ('start', 'end'):
            value = data.get(key, '')
            if not isinstance(value, str) or not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', value):
                raise ValueError('Bitte gültige Uhrzeiten angeben.')
            clean[key] = value
    make_bounds(clean)
    return clean


def make_bounds(data):
    start_day, end_day = date.fromisoformat(data['date']), date.fromisoformat(data['endDate'])
    if data['allDay']:
        return {'date': start_day.isoformat()}, {'date': (end_day+timedelta(days=1)).isoformat()}
    result = []
    for day, key in ((start_day, 'start'), (end_day, 'end')):
        moment = datetime.combine(day, time.fromisoformat(data[key]), TZ)
        if moment.replace(fold=1).utcoffset() != moment.utcoffset():
            raise ValueError('Diese Uhrzeit liegt in der Zeitumstellung. Bitte in Google Kalender bearbeiten.')
        result.append(moment)
    if result[1] <= result[0]:
        raise ValueError('Das Ende muss nach dem Beginn liegen.')
    return tuple({'dateTime': moment.isoformat(), 'timeZone': 'Europe/Berlin'} for moment in result)


def editable(event, info):
    if event.get('status') == 'cancelled' or event.get('eventType', 'default') != 'default' or event.get('recurrence'):
        raise GoogleError('Diesen speziellen Termin bitte in Google Kalender bearbeiten.', 403)
    organizer = event.get('organizer') or {}
    if organizer.get('self') is not True and organizer.get('email') != info['id']:
        raise GoogleError('Der Termin gehört einem anderen Organisator. Bitte in Google Kalender bearbeiten.', 403)
    if not isinstance(event.get('id'), str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,1024}', event['id']):
        raise GoogleError('Google hat keine eindeutige Terminkennung geliefert.', 409)
    if not isinstance(event.get('etag'), str) or not re.fullmatch(r'"[^\x00-\x20\x7f"]{1,200}"', event['etag']):
        raise GoogleError('Google hat keine sichere Terminversion geliefert.', 409)
    bounds(event)


class Editor:
    def __init__(self, app):
        self.app = app
        self.sessions, self.reviews = {}, {}
        self.lock = asyncio.Lock()

    def purge(self):
        now = monotime.monotonic()
        for store in (self.sessions, self.reviews):
            for key in list(store):
                if store[key]['expires'] < now:
                    del store[key]
            while len(store) > 100:
                del store[next(iter(store))]

    def remember(self, store, payload):
        self.purge()
        key = secrets.token_urlsafe(32)
        store[key] = {**payload, 'expires': monotime.monotonic()+1200}
        return key

    def lookup(self, store, key):
        self.purge()
        if not isinstance(key, str) or key not in store:
            raise GoogleError('Bearbeitung ist abgelaufen. Bitte den Termin neu öffnen.', 409)
        return store[key]

    @property
    def client(self):
        return self.app['google_calendar']

    async def open(self, query):
        if query.get('source') != 'joern' or not re.fullmatch(r'[a-f0-9]{24}-\d{4}-\d{2}-\d{2}', query.get('id', '')):
            raise GoogleError('Nur Termine aus Jörns Google-Kalender sind hier bearbeitbar.', 403)
        day = date.fromisoformat(query['date'])
        source = self.app['sources'][1]
        raw = await asyncio.wait_for(self.app['ha'].events(source['entity'], day, day+timedelta(days=1)), 8)
        matched = []
        if not isinstance(raw, list):
            raise GoogleError('Home Assistant hat keine gültigen Termindaten geliefert.')
        for event in raw:
            try:
                if any(row['id'] == query['id'] for row in normalize_event(event, source, day, day+timedelta(days=1))):
                    matched.append(event)
            except (KeyError, TypeError, ValueError):
                continue
        if len(matched) != 1 or not isinstance(matched[0].get('uid'), str) or not matched[0]['uid']:
            raise GoogleError('Der Termin lässt sich nicht eindeutig zuordnen. Kalender aktualisieren und neu öffnen.', 409)
        original = matched[0]
        start, end, _ = bounds(original)
        if end-start > timedelta(days=366):
            raise GoogleError('Sehr lange Termine bitte in Google Kalender bearbeiten.', 403)
        info = await self.client.info()
        candidates = await self.client.events({'iCalUID': original['uid'], 'singleEvents': 'true', 'showDeleted': 'false',
            'timeMin': (start-timedelta(days=1)).isoformat(), 'timeMax': (end+timedelta(days=1)).isoformat()})
        matches = []
        for event in candidates:
            try:
                if event.get('iCalUID') != original['uid'] or event.get('status') == 'cancelled':
                    continue
                if original.get('recurrence_id') and event.get('id') != original['recurrence_id']:
                    continue
                if bounds(event) == bounds(original):
                    matches.append(event)
            except (ValueError, KeyError, TypeError):
                continue
        if len(matches) != 1:
            raise GoogleError('Google und Home Assistant zeigen unterschiedliche oder uneindeutige Termindaten. Bitte aktualisieren.', 409)
        event = matches[0]
        editable(event, info)
        session = self.remember(self.sessions, {'event': event, 'info': info, 'sourceEntity': source['entity'],
            'calendar': self.client.calendar, 'oldFingerprint': query['id'][:24], 'uid': original['uid']})
        return {'session': session, 'values': values(event), 'calendarName': info['name'], 'calendarId': info['id'],
                'recurring': bool(event.get('recurringEventId')), 'hasGuests': bool(event.get('attendees'))}

    async def preview(self, data):
        context = self.lookup(self.sessions, data.get('session'))
        event = context['event']
        clean = validate_values(data.get('values'))
        prior = validate_values(values(event))
        patch = {key: clean[field] for key, field in (('summary','title'), ('location','location'), ('description','description')) if clean[field] != prior[field]}
        time_keys = ('date','endDate','start','end','allDay')
        if any(clean[k] != prior[k] for k in time_keys):
            patch['start'], patch['end'] = make_bounds(clean)
        if not patch:
            raise GoogleError('Es gibt keine Änderungen zum Speichern.', 400)
        current = await self.client.get(event['id'])
        if current.get('etag') != event['etag']:
            raise GoogleError('Der Termin wurde inzwischen geändert. Bitte neu öffnen, damit nichts überschrieben wird.', 409)
        editable(current, context['info'])
        target = {**event, **patch}
        start, end, all_day = bounds(target)
        conflicts = []
        conflict_warning = ''
        if not all_day:
            try:
                for other in await self.client.events({'singleEvents':'true', 'showDeleted':'false', 'timeMin':start.isoformat(), 'timeMax':end.isoformat()}):
                    try:
                        a, b, full = bounds(other)
                        if other.get('id') != event['id'] and other.get('status') != 'cancelled' and not full and a < end and b > start:
                            conflicts.append(values(other))
                    except (TypeError, ValueError, KeyError):
                        conflict_warning = 'Einige Termine konnten nicht auf Überschneidung geprüft werden.'
            except GoogleError:
                conflict_warning = 'Überschneidungen konnten nicht vollständig geprüft werden.'
        # Review tokens bind the precise patch and target version. Only this token can be saved.
        review = self.remember(self.reviews, {**context, 'patch':patch, 'values':clean})
        return {'review':review, 'before':values(event), 'after':clean, 'calendarName':context['info']['name'],
                'recurring':bool(event.get('recurringEventId')), 'hasGuests':bool(event.get('attendees')),
                'conflicts':conflicts[:20], 'conflictCount':len(conflicts), 'warning':conflict_warning}

    async def save(self, data, request_key):
        if not re.fullmatch(r'[a-zA-Z0-9-]{16,100}', request_key):
            raise GoogleError('Ungültige Anfragekennung.', 400)
        context = self.lookup(self.reviews, data.get('review'))
        event, patch = context['event'], context['patch']
        semantic_key = 'gcal-'+digest([context['calendar'], event['id'], event['etag']])
        payload_digest = digest(patch)
        async with self.app['write_lock']:
            db = self.app['db']
            previous = db.execute('SELECT digest,status FROM submissions WHERE key=?', (semantic_key,)).fetchone()
            if previous:
                if previous[0] == payload_digest and previous[1] == 'done':
                    return {'success':True, 'date':context['values']['date']}
                raise GoogleError('Speicherung bereits ausgeführt oder unklar. Google Kalender prüfen und den Termin neu öffnen.', 409, uncertain=previous[1]!='done')
            if self.client.calendar != context['calendar'] or self.app['sources'][1]['entity'] != context['sourceEntity']:
                raise GoogleError('Die Kalenderzuordnung wurde geändert. Bitte den Termin neu öffnen.', 409)
            current = await self.client.get(event['id'])
            if current.get('etag') != event['etag']:
                raise GoogleError('Der Termin wurde inzwischen geändert. Bitte neu öffnen, damit nichts überschrieben wird.', 409)
            editable(current, context['info'])
            db.execute('INSERT INTO submissions VALUES (?,?,?)', (semantic_key,payload_digest,'pending'))
            db.commit()
            try:
                updated = await self.client.patch(event['id'], patch, event['etag'])
                if updated.get('id') != event['id'] or not updated.get('etag') or updated.get('etag') == event['etag']:
                    raise GoogleError('Google hat die Änderung nicht eindeutig bestätigt. Kalender prüfen.', 502, uncertain=True)
                for key, value in patch.items():
                    if key in ('start','end'):
                        if parse_boundary(updated[key]) != parse_boundary(value):
                            raise GoogleError('Terminzeit nicht eindeutig bestätigt. Kalender prüfen.', 502, uncertain=True)
                    elif updated.get(key, '') != value:
                        raise GoogleError('Änderung nicht eindeutig bestätigt. Kalender prüfen.', 502, uncertain=True)
            except GoogleError as err:
                if not err.uncertain:
                    db.execute('DELETE FROM submissions WHERE key=?', (semantic_key,))
                    db.commit()
                raise
            except Exception:
                raise GoogleError('Keine sichere Bestätigung. Google Kalender prüfen und den Termin neu öffnen.', 502, uncertain=True) from None
            db.execute('UPDATE submissions SET status=? WHERE key=?', ('done',semantic_key))
            db.commit()
        warning = ''
        try:
            await asyncio.wait_for(self.app['ha'].service('homeassistant','update_entity',{'entity_id':context['sourceEntity']}), 5)
        except Exception:
            warning = 'In Google gespeichert. Home Assistant wird beim nächsten Kalenderabruf nachgezogen.'
        return {'success':True, 'date':context['values']['date'], 'warning':warning}


def error_response(err):
    return web.json_response({'error':str(err), 'conflict':err.status==409 and not err.uncertain, 'uncertain':err.uncertain}, status=err.status)


async def status(request):
    result=request.app['google_calendar'].status()
    return web.json_response(await result if inspect.isawaitable(result) else result)


async def check(request):
    try:
        async with asyncio.timeout(30):
            result = await request.app['google_calendar'].info()
        return web.json_response({'success':True,'calendarId':result['id'],'calendarName':result['name']})
    except GoogleError as err:
        return error_response(err)
    except asyncio.TimeoutError:
        return error_response(GoogleError('Google-Prüfung dauert zu lange. Bitte später erneut versuchen.', 503))


async def open_event(request):
    try:
        async with asyncio.timeout(30):
            result = await request.app['calendar_editor'].open(request.query)
        return web.json_response(result)
    except GoogleError as err:
        return error_response(err)
    except (ValueError, TypeError, KeyError):
        return error_response(GoogleError('Ungültige oder unvollständige Termindaten.', 400))
    except (UpstreamError, asyncio.TimeoutError):
        return error_response(GoogleError('Kalender ist momentan nicht erreichbar. Bitte erneut versuchen.', 503))


async def action(request):
    try:
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError('Invalid data')
        editor = request.app['calendar_editor']
        # Prevent parallel preparations/saves from accumulating upstream calls.
        if editor.lock.locked():
            raise GoogleError('Eine Terminbearbeitung läuft bereits. Bitte kurz warten.', 429)
        async with editor.lock:
            if data.get('action') == 'preview':
                result = await editor.preview(data)
            elif data.get('action') == 'save':
                result = await editor.save(data,request.headers.get('Idempotency-Key',''))
            else:
                raise ValueError('Unknown action')
        return web.json_response(result)
    except GoogleError as err:
        return error_response(err)
    except (ValueError, TypeError, KeyError):
        return error_response(GoogleError('Bitte Titel, Datum und Uhrzeiten prüfen.', 400))


def setup(app, options):
    from calendar_connection import Connection, package
    app['google_calendar'] = Connection(app,options)
    app['calendar_editor'] = Editor(app)
    async def close(app):
        await app['google_calendar'].close()
    app.on_cleanup.append(close)
    app.router.add_get('/api/calendar/google', status)
    app.router.add_post('/api/calendar/google/check', check)
    app.router.add_get('/api/calendar/event', open_event)
    app.router.add_post('/api/calendar/event', action)
    app.router.add_get('/api/calendar/bridge.zip',package)
