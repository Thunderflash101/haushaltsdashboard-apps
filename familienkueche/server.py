"""Local family calendar. Reachable exclusively through Home Assistant ingress."""
import asyncio
import hashlib
import json
import os
import re
import sqlite3
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from aiohttp import ClientError, ClientSession, ClientTimeout, web

ROOT = Path(__file__).parent
TZ = ZoneInfo('Europe/Berlin')
SOURCES = (
    {'key': 'tina', 'entity': 'calendar.tina', 'label': 'Tina · Kalender', 'person': 'tina'},
    {'key': 'joern', 'entity': 'calendar.joern', 'label': 'Jörn · Google', 'person': 'joern'},
    {'key': 'waste', 'entity': 'calendar.muell', 'label': 'Müllabfuhr', 'person': 'alle'},
    {'key': 'birthdays', 'entity': 'calendar.geburtstage_2', 'label': 'Geburtstage', 'person': 'alle'},
    {'key': 'holidays', 'entity': 'calendar.feiertage_in_deutschland', 'label': 'Feiertage', 'person': 'alle'},
)

class UpstreamError(Exception):
    pass

class HomeAssistant:
    def __init__(self, session, token):
        self.session = session
        self.token = token

    async def request(self, method, path, payload=None, params=None):
        try:
            async with self.session.request(method, 'http://supervisor/core/api/' + path,
                    headers={'Authorization': 'Bearer ' + self.token}, json=payload,
                    params=params, allow_redirects=False) as response:
                if response.status >= 300:
                    raise UpstreamError('Home Assistant konnte die Anfrage nicht ausführen.')
                return await response.json()
        except (ClientError, OSError, asyncio.TimeoutError, ValueError) as exc:
            raise UpstreamError('Home Assistant ist momentan nicht erreichbar.') from exc

    async def events(self, entity, start, end):
        return await self.request('GET', 'calendars/' + entity, params={
            'start': datetime.combine(start, time.min, TZ).isoformat(),
            'end': datetime.combine(end, time.min, TZ).isoformat()})

    async def features(self, entity):
        state = await self.request('GET', 'states/' + entity)
        if state.get('state') in ('unavailable', 'unknown'):
            raise UpstreamError('Kalender ist momentan nicht verfügbar.')
        return int(state.get('attributes', {}).get('supported_features', 0))

    async def create(self, payload):
        return await self.request('POST', 'services/calendar/create_event', payload)

    async def service(self, domain, name, payload, response=False):
        result = await self.request('POST', 'services/' + domain + '/' + name, payload,
                                    params={'return_response': ''} if response else None)
        if response:
            if not isinstance(result, dict) or 'service_response' not in result:
                raise UpstreamError('Home Assistant hat keine Dienstantwort geliefert.')
            return result['service_response']
        return result


def parse_boundary(value):
    if 'dateTime' in value:
        result = datetime.fromisoformat(value['dateTime'].replace('Z', '+00:00'))
        return (result.replace(tzinfo=TZ) if result.tzinfo is None else result.astimezone(TZ)), False
    return datetime.combine(date.fromisoformat(value['date']), time.min, TZ), True


def normalize_event(event, source, start, end):
    """Split multi-day entries; HA's end date is exclusive, including midnight."""
    begins, all_day = parse_boundary(event['start'])
    finishes, end_all_day = parse_boundary(event['end'])
    if all_day != end_all_day or finishes <= begins:
        raise ValueError('Invalid calendar bounds')
    first = max(start, begins.date())
    last = min(end, finishes.date() + (timedelta(days=1) if finishes.time() != time.min else timedelta()))
    fingerprint = hashlib.sha256(json.dumps([source['key'], event.get('uid'), event.get('recurrence_id'),
        event.get('summary'), begins.isoformat(), finishes.isoformat()], ensure_ascii=False).encode()).hexdigest()[:24]
    rows = []
    day = first
    while day < last:
        segment_start = max(begins, datetime.combine(day, time.min, TZ))
        segment_end = min(finishes, datetime.combine(day + timedelta(days=1), time.min, TZ))
        rows.append({'id': fingerprint + '-' + day.isoformat(), 'title': event.get('summary') or 'Ohne Titel',
            'date': day.isoformat(), 'start': segment_start.strftime('%H:%M'),
            'end': '24:00' if segment_end.date() > day else segment_end.strftime('%H:%M'),
            'person': source['person'], 'source': source['key'], 'sourceLabel': source['label'],
            'allDay': all_day, 'kind': source['key'], 'readOnly': True, 'isWaste': source['key'] == 'waste',
            'description': event.get('description') or '', 'location': event.get('location') or '',
            'originalStart': begins.isoformat(), 'originalEnd': finishes.isoformat()})
        day += timedelta(days=1)
    return rows


def validated_window(query):
    start, end = date.fromisoformat(query['start']), date.fromisoformat(query['end'])
    if not 0 < (end - start).days <= 63:
        raise ValueError('Invalid date range')
    return start, end


def validate_create(data):
    title = data.get('title')
    if not isinstance(title, str) or not title.strip() or len(title) > 100:
        raise ValueError('Bitte einen Titel mit höchstens 100 Zeichen angeben.')
    if data.get('person') != 'joern':
        raise ValueError('Neue Termine können aktuell nur in Jörns Kalender gespeichert werden.')
    day = date.fromisoformat(data['date'])
    result = {'entity_id': SOURCES[1]['entity'], 'summary': title.strip()}
    if data.get('allDay') is True:
        result.update(start_date=day.isoformat(), end_date=(day + timedelta(days=1)).isoformat())
    else:
        bounds = []
        for name in ('start', 'end'):
            value = data.get(name, '')
            if not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', value):
                raise ValueError('Bitte gültige Uhrzeiten angeben.')
            dt = datetime.combine(day, time.fromisoformat(value), TZ)
            # Refuse ambiguous or non-existent times on the DST transition.
            if dt.replace(fold=1).utcoffset() != dt.utcoffset():
                raise ValueError('Diese Uhrzeit liegt in der Zeitumstellung. Bitte in Google Kalender anlegen.')
            bounds.append(dt)
        if bounds[1] <= bounds[0]:
            raise ValueError('Die Endzeit muss nach der Startzeit liegen.')
        result.update(start_date_time=bounds[0].isoformat(), end_date_time=bounds[1].isoformat())
    return result


@web.middleware
async def ingress_only(request, handler):
    # Check the TCP peer, never a client-supplied Forwarded/X-Forwarded-For header.
    if request.remote != '172.30.32.2':
        raise web.HTTPForbidden(text='Bitte über Home Assistant öffnen.')
    if request.method not in ('GET', 'HEAD'):
        if request.headers.get('X-Family-Request') != '1' or request.content_type != 'application/json':
            raise web.HTTPForbidden(text='Ungültige Anfrage.')
        # Custom header plus no CORS prevents cross-origin form/fetch writes.
        if request.headers.get('Sec-Fetch-Site') == 'cross-site':
            raise web.HTTPForbidden(text='Ungültiger Ursprung.')
    response = await handler(request)
    response.headers.update({'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
                             'Referrer-Policy': 'same-origin'})
    return response


async def calendar(request):
    try:
        start, end = validated_window(request.query)
    except (ValueError, KeyError):
        return web.json_response({'error': 'Bitte einen Zeitraum von höchstens 63 Tagen wählen.'}, status=400)
    async def one(source):
        try:
            raw, features = await asyncio.gather(request.app['ha'].events(source['entity'], start, end),
                                                 request.app['ha'].features(source['entity']))
            events, skipped = [], 0
            for event in raw:
                try:
                    events.extend(normalize_event(event, source, start, end))
                except (ValueError, KeyError, TypeError):
                    skipped += 1
            return {'key': source['key'], 'label': source['label'], 'ok': True, 'events': events,
                    'warning': str(skipped) + ' ungültige Termine konnten nicht angezeigt werden.' if skipped else '',
                    'canCreate': source['key'] == 'joern' and bool(features & 1)}
        except (UpstreamError, ValueError, TypeError):
            return {'key': source['key'], 'label': source['label'], 'ok': False,
                    'error': 'Kalender konnte nicht geladen werden.', 'canCreate': False}
    sources = await asyncio.gather(*(one(source) for source in request.app['sources']))
    return web.json_response({'sources': sources, 'timezone': 'Europe/Berlin',
                             'fetchedAt': datetime.now(TZ).isoformat()})


async def create_event(request):
    try:
        data = await request.json()
        key = request.headers.get('Idempotency-Key', '')
        if not re.fullmatch(r'[a-zA-Z0-9-]{16,100}', key):
            raise ValueError('Ungültige Anfragekennung.')
        payload = validate_create(data)
        payload['entity_id'] = request.app['sources'][1]['entity']
    except (ValueError, KeyError, TypeError, AttributeError):
        return web.json_response({'error': 'Titel, Datum oder Uhrzeiten sind ungültig. Ziel ist Jörns Kalender.'}, status=400)
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    async with request.app['write_lock']:
        db = request.app['db']
        previous = db.execute('SELECT digest, status FROM submissions WHERE key=?', (key,)).fetchone()
        if previous:
            if previous[0] != digest:
                return web.json_response({'error': 'Anfragekennung wurde bereits verwendet.'}, status=409)
            if previous[1] == 'done':
                return web.json_response({'success': True})
            return web.json_response({'error': 'Speicherstatus unklar. Erst im Kalender prüfen; nicht erneut anlegen.', 'uncertain': True}, status=409)
        try:
            if not await request.app['ha'].features(request.app['sources'][1]['entity']) & 1:
                return web.json_response({'error': 'Dieser Kalender erlaubt momentan keine neuen Termine.'}, status=403)
        except UpstreamError:
            return web.json_response({'error': 'Kalender nicht erreichbar. Es wurde nichts gesendet.'}, status=503)
        db.execute('INSERT INTO submissions VALUES (?, ?, ?)', (key, digest, 'pending'))
        db.commit()
        try:
            await request.app['ha'].create(payload)
        except Exception:
            # Do not replay an ambiguous write, even across app restarts.
            return web.json_response({'error': 'Keine sichere Bestätigung. Bitte den Kalender prüfen, bevor du erneut anlegst.', 'uncertain': True}, status=502)
        db.execute('UPDATE submissions SET status=? WHERE key=?', ('done', key))
        db.commit()
    return web.json_response({'success': True})


async def index(request):
    return web.FileResponse(ROOT / 'www' / 'index.html')


def make_app(ha, db_path='/data/submissions.sqlite', options=None):
    app = web.Application(middlewares=[ingress_only], client_max_size=3_000_000)
    app['ha'], app['write_lock'] = ha, asyncio.Lock()
    options = options or {}
    app['sources'] = [dict(source, entity=options.get(field) or source['entity']) for source, field in zip(SOURCES, ('tina_calendar', 'joern_calendar', 'waste_calendar', 'birthdays_calendar', 'holidays_calendar'))]
    if any(not re.fullmatch(r'calendar\.[a-z0-9_]+', source['entity']) for source in app['sources']):
        raise ValueError('Ungültige Kalender-Entität in der App-Konfiguration.')
    db = sqlite3.connect(db_path)
    db.execute('CREATE TABLE IF NOT EXISTS submissions (key TEXT PRIMARY KEY, digest TEXT, status TEXT)')
    app['db'] = db
    async def close_db(app):
        app['db'].close()
    app.on_cleanup.append(close_db)
    from meals import setup
    setup(app, options or {})
    from weather import setup as setup_weather
    setup_weather(app, options)
    from shopping import setup as setup_shopping
    setup_shopping(app, options)
    from ingredients import setup as setup_ingredients
    setup_ingredients(app)
    from suggestions import setup as setup_suggestions
    setup_suggestions(app)
    from weekly import setup as setup_weekly
    setup_weekly(app)
    from family import setup as setup_family
    setup_family(app)
    from photos import setup as setup_photos
    setup_photos(app)
    from reminders import setup as setup_reminders
    setup_reminders(app)
    app.router.add_get('/', index)
    app.router.add_get('/api/calendar', calendar)
    app.router.add_post('/api/events', create_event)
    # Explicit assets only: no directory listing or access to server/config/database files.
    for filename in ('app.js', 'meals.js', 'weather.js', 'shopping.js', 'ingredients.js', 'suggestions.js', 'timer-core.js', 'cooking.js', 'family.js', 'saver.js', 'reminders.js', 'style.css'):
        async def asset(request, filename=filename):
            return web.FileResponse(ROOT / 'www' / filename)
        app.router.add_get('/' + filename, asset)
    return app


async def start_app():
    token = os.environ.get('SUPERVISOR_TOKEN')
    if not token:
        raise RuntimeError('Diese App muss über Home Assistant gestartet werden.')
    options = json.loads(Path('/data/options.json').read_text()) if Path('/data/options.json').exists() else {}
    session = ClientSession(timeout=ClientTimeout(total=90))
    app = make_app(HomeAssistant(session, token), options=options)
    async def cleanup(app):
        await session.close()
    app.on_cleanup.append(cleanup)
    return app


if __name__ == '__main__':
    web.run_app(start_app(), host='0.0.0.0', port=8099, access_log=None)
