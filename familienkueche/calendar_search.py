"""Bounded, read-only search of configured HA calendars. No local event archive."""
import asyncio
import unicodedata
from datetime import date, datetime, timedelta

from aiohttp import web

from server import TZ, UpstreamError, normalize_event

MAX_DAYS = 366
RESULT_LIMIT = 100
SOURCE_TIMEOUT = 24
WINDOW_TIMEOUT = 6
MAX_RAW = 20000


def folded(value):
    text = str(value or '').casefold().replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue')
    return ''.join(c for c in unicodedata.normalize('NFKD', text) if not unicodedata.combining(c))


def validate(query):
    term = query.get('q', '').strip()
    person = query.get('person', 'alle')
    start, end = date.fromisoformat(query['start']), date.fromisoformat(query['end'])
    if len(term) < 2 or len(term) > 100 or not 0 < (end - start).days <= MAX_DAYS:
        raise ValueError('Invalid search')
    if person not in ('alle', 'tina', 'joern', 'felix'):
        raise ValueError('Invalid person')
    return term, person, start, end


async def search(request):
    try:
        term, person, start, end = validate(request.query)
    except (ValueError, KeyError, TypeError):
        return web.json_response({'error': 'Bitte 2–100 Zeichen und einen Zeitraum von höchstens 366 Tagen wählen.'}, status=400)
    # Avoid multiplying long upstream reads when several tablets search at once.
    lock = request.app['calendar_search_lock']
    if lock.locked():
        return web.json_response({'error': 'Eine Kalendersuche läuft bereits. Bitte kurz warten.'}, status=429)
    sources = [s for s in request.app['sources'] if person == 'alle' or s['person'] == person]
    tokens = folded(term).split()

    async def one(source):
        matches, seen = [], set()
        total = processed = skipped = failed = 0
        cursor = start
        try:
            async with asyncio.timeout(SOURCE_TIMEOUT):
                while cursor < end:
                    stop = min(end, cursor + timedelta(days=63))
                    try:
                        raw = await asyncio.wait_for(request.app['ha'].events(source['entity'], cursor, stop), WINDOW_TIMEOUT)
                        if not isinstance(raw, list):
                            raise ValueError('Invalid source response')
                        for entry in raw:
                            processed += 1
                            if processed > MAX_RAW:
                                raise OverflowError('Search limit')
                            try:
                                rows = normalize_event(entry, source, cursor, stop)
                            except (ValueError, KeyError, TypeError, AttributeError, OverflowError):
                                skipped += 1
                                continue
                            if not rows:
                                continue
                            event = rows[0]
                            # One result per occurrence, even across days / 63-day window boundaries.
                            occurrence = event['id'][:24]
                            if occurrence in seen:
                                continue
                            seen.add(occurrence)
                            haystack = folded(' '.join(str(event.get(k) or '') for k in ('title', 'location', 'description')))
                            if all(token in haystack for token in tokens):
                                total += 1
                                matches.append(event)
                                matches.sort(key=lambda e: (e['date'], not e['allDay'], e['start'], e['title'], e['id']))
                                del matches[RESULT_LIMIT:]
                    except (UpstreamError, ValueError, TypeError, OSError, asyncio.TimeoutError):
                        failed += 1
                    cursor = stop
        except (asyncio.TimeoutError, OverflowError):
            # Preserve already read results; never present a partial search as complete.
            failed += 1
        warning = ''
        if failed:
            warning = 'Nicht alle Zeiträume konnten durchsucht werden. Zeitraum eingrenzen oder erneut suchen.'
        if skipped:
            warning += (' ' if warning else '') + str(skipped) + ' ungültige Einträge wurden übersprungen.'
        return {'key': source['key'], 'label': source['label'], 'ok': not failed and not skipped,
                'warning': warning, 'events': matches, 'total': total}

    async with lock:
        results = await asyncio.gather(*(one(source) for source in sources))
    events = sorted((e for s in results for e in s['events']), key=lambda e: (e['date'], not e['allDay'], e['start'], e['title'], e['id']))
    total = sum(s['total'] for s in results)
    return web.json_response({'events': events[:RESULT_LIMIT], 'total': total, 'truncated': total > RESULT_LIMIT,
        'sources': [{k: s[k] for k in ('key', 'label', 'ok', 'warning')} for s in results],
        'query': term, 'person': person, 'start': start.isoformat(), 'end': end.isoformat(),
        'fetchedAt': datetime.now(TZ).isoformat()})


def setup(app):
    app['calendar_search_lock'] = asyncio.Lock()
    app.router.add_get('/api/calendar/search', search)
