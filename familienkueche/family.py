"""Shared household tasks and routines, persisted locally in the add-on data DB."""
import hashlib
import json
import re
import uuid
from datetime import date, datetime, timedelta

from aiohttp import web
from server import TZ

PEOPLE = ('alle', 'tina', 'joern', 'felix')
ICONS = ('check', 'sun', 'moon', 'tooth', 'shirt', 'bag', 'book', 'tidy', 'dishes', 'trash', 'bed', 'heart')


def today():
    return datetime.now(TZ).date()


def day_value(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise ValueError('Bitte ein gültiges Datum wählen.')
    day = date.fromisoformat(value)
    if abs((day - today()).days) > 366:
        raise ValueError('Bitte ein Datum innerhalb eines Jahres wählen.')
    return day


def text(value, limit):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError('Bitte einen kurzen, nicht leeren Text eingeben.')
    return value.strip()


def assignees(data):
    return data.get('assignees', [data.get('person', 'alle')])


def definition(data, previous=None):
    if not isinstance(data, dict):
        raise ValueError('Ungültige Aufgabe.')
    kind = data.get('kind')
    if kind not in ('task', 'routine') or data.get('person') not in PEOPLE or data.get('icon') not in ICONS:
        raise ValueError('Bitte Art, Person und Symbol wählen.')
    assigned = assignees(data)
    # Older open clients do not know the list: preserve an existing group if
    # they submit the same legacy person rather than silently dropping members.
    if 'assignees' not in data and previous and data['person'] == previous['person']:
        assigned = assignees(previous)
    if (not isinstance(assigned, list) or not 1 <= len(assigned) <= 3
            or any(not isinstance(p, str) or p not in PEOPLE for p in assigned)
            or len(set(assigned)) != len(assigned) or ('alle' in assigned and len(assigned) != 1)):
        raise ValueError('Bitte mindestens eine Person oder Familie wählen.')
    assigned = [p for p in PEOPLE if p in assigned]
    if previous and previous['kind'] != kind:
        raise ValueError('Die Art kann nachträglich nicht geändert werden.')
    start_value = data.get('startDate')
    if not isinstance(start_value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', start_value):
        raise ValueError('Bitte ein gültiges Startdatum wählen.')
    start = date.fromisoformat(start_value).isoformat()
    if not '2000-01-01' <= start <= '2100-12-31':
        raise ValueError('Bitte ein Startdatum zwischen 2000 und 2100 wählen.')
    days = data.get('weekdays')
    if not isinstance(days, list) or len(days) > 7 or any(type(x) is not int or x not in range(7) for x in days) or len(set(days)) != len(days):
        raise ValueError('Bitte gültige Wochentage wählen.')
    if kind == 'routine' and not days:
        raise ValueError('Für eine Routine mindestens einen Wochentag wählen.')
    result = dict(kind=kind, title=text(data.get('title'), 100),
                  person=assigned[0] if len(assigned) == 1 else 'alle', assignees=assigned,
                  icon=data['icon'], startDate=start, weekdays=sorted(days), steps=[])
    if kind == 'routine':
        steps = data.get('steps')
        if not isinstance(steps, list) or not 1 <= len(steps) <= 12:
            raise ValueError('Eine Routine braucht 1 bis 12 Schritte.')
        old = {s['id']: s for s in previous.get('steps', [])} if previous else {}
        used = set()
        for step in steps:
            if not isinstance(step, dict) or step.get('icon') not in ICONS:
                raise ValueError('Bitte für jeden Schritt ein Symbol wählen.')
            title = text(step.get('title'), 100)
            prior = old.get(step.get('id'))
            # An edited step is a new step: old checkmarks must not silently carry over.
            ident = prior['id'] if prior and prior['title'] == title and prior['icon'] == step['icon'] else uuid.uuid4().hex
            if ident in used:
                raise ValueError('Ein Schritt darf nur einmal vorkommen.')
            used.add(ident)
            result['steps'].append(dict(id=ident, title=title, icon=step['icon']))
    return result


def scheduled(item, day):
    return day.isoformat() >= item['startDate'] and (not item['weekdays'] or day.weekday() in item['weekdays'])


def occurrence(item, day):
    return day.isoformat() if item['weekdays'] else 'once'


def progress(db, ident, item, day):
    rows = db.execute('SELECT step_id FROM family_checks WHERE item_id=? AND occurrence=? ORDER BY step_id',
                      (ident, occurrence(item, day))).fetchall()
    checked = [row[0] for row in rows]
    revision = hashlib.sha256(json.dumps(checked).encode()).hexdigest()
    return checked, revision


def snapshot(app, day):
    result = []
    for ident, raw, revision in app['db'].execute('SELECT id, data, revision FROM family_items ORDER BY created, id'):
        item = json.loads(raw)
        checked, stamp = progress(app['db'], ident, item, day)
        active = scheduled(item, day)
        steps = [dict(s, done=s['id'] in checked) for s in item['steps']]
        done = all(s['done'] for s in steps) if steps else 'task' in checked
        result.append(dict(item, assignees=assignees(item), id=ident, revision=revision, steps=steps, active=active,
                           done=done, progressRevision=stamp))
    return dict(items=result, date=day.isoformat(), today=today().isoformat(), timezone='Europe/Berlin')


async def get_items(request):
    try:
        day = day_value(request.query.get('date', today().isoformat()))
    except ValueError as exc:
        return web.json_response({'error': str(exc)}, status=400)
    return web.json_response(snapshot(request.app, day))


def receipt_key(request, namespace):
    key = request.headers.get('Idempotency-Key', '')
    if not re.fullmatch(r'[a-zA-Z0-9-]{16,100}', key):
        raise ValueError('Ungültige Anfragekennung.')
    return namespace + ':' + key


def saved_response(db, key, digest):
    row = db.execute('SELECT digest, response FROM family_requests WHERE key=?', (key,)).fetchone()
    if not row:
        return None
    if row[0] != digest:
        return web.json_response({'error': 'Anfragekennung bereits verwendet.', 'conflict': True}, status=409)
    return web.json_response(json.loads(row[1]))


def save_response(db, key, digest, result):
    db.execute('INSERT INTO family_requests VALUES (?, ?, ?, ?)',
               (key, digest, json.dumps(result), datetime.now(TZ).isoformat()))
    # Bound receipt storage; old requests contain random IDs, and are not retried by the UI.
    db.execute('DELETE FROM family_requests WHERE created < ?', ((datetime.now(TZ) - timedelta(days=90)).isoformat(),))


async def write_item(request):
    try:
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError('Ungültige Anfrage.')
        key = receipt_key(request, 'family')
        digest = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
        action = data.get('action')
        if action not in ('create', 'edit', 'remove', 'check'):
            raise ValueError('Unbekannte Aktion.')
    except (ValueError, TypeError) as exc:
        return web.json_response({'error': str(exc)}, status=400)
    async with request.app['write_lock']:
        db = request.app['db']
        saved = saved_response(db, key, digest)
        if saved is not None:
            return saved
        try:
            ident = data.get('id')
            old = None
            if action != 'create':
                if not isinstance(ident, str):
                    raise ValueError('Ungültige Aufgabe.')
                row = db.execute('SELECT data, revision FROM family_items WHERE id=?', (ident,)).fetchone()
                if not row or type(data.get('revision')) is not int or row[1] != data['revision']:
                    return web.json_response({'error': 'Die Aufgabe wurde inzwischen geändert. Bitte aktualisieren.', 'conflict': True}, status=409)
                old = json.loads(row[0])
            if action in ('create', 'edit'):
                item = definition(data.get('item'), old)
                if action == 'create' and db.execute('SELECT count(*) FROM family_items').fetchone()[0] >= 200:
                    raise ValueError('Es sind bereits 200 Aufgaben und Routinen vorhanden.')
                ident = ident if action == 'edit' else uuid.uuid4().hex
            elif action == 'check':
                day = day_value(data.get('date'))
                if day > today() or day < today() - timedelta(days=31) or not scheduled(old, day):
                    raise ValueError('Nur anstehende Aufgaben von heute oder den letzten 31 Tagen abhaken.')
                step = data.get('step')
                if step not in ([s['id'] for s in old['steps']] if old['kind'] == 'routine' else ['task']) or type(data.get('done')) is not bool:
                    raise ValueError('Ungültiger Schritt.')
                checked, stamp = progress(db, ident, old, day)
                if data.get('progressRevision') != stamp:
                    return web.json_response({'error': 'Der Fortschritt wurde inzwischen geändert. Bitte aktualisieren.', 'conflict': True}, status=409)
            with db:
                if action == 'create':
                    db.execute('INSERT INTO family_items VALUES (?, ?, ?, ?)',
                               (ident, json.dumps(item), 1, datetime.now(TZ).isoformat()))
                elif action == 'edit':
                    db.execute('UPDATE family_items SET data=?, revision=revision+1 WHERE id=?', (json.dumps(item), ident))
                elif action == 'remove':
                    db.execute('DELETE FROM family_checks WHERE item_id=?', (ident,))
                    db.execute('DELETE FROM family_items WHERE id=?', (ident,))
                elif action == 'check':
                    args = (ident, occurrence(old, day), step)
                    if data['done']:
                        db.execute('INSERT OR IGNORE INTO family_checks VALUES (?, ?, ?, ?)', args + (datetime.now(TZ).isoformat(),))
                    else:
                        db.execute('DELETE FROM family_checks WHERE item_id=? AND occurrence=? AND step_id=?', args)
                result = {'success': True, 'id': ident}
                save_response(db, key, digest, result)
            return web.json_response(result)
        except (ValueError, TypeError, KeyError) as exc:
            return web.json_response({'error': str(exc)}, status=400)


def setup(app):
    db = app['db']
    db.execute('CREATE TABLE IF NOT EXISTS family_items (id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL, created TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS family_checks (item_id TEXT, occurrence TEXT, step_id TEXT, completed_at TEXT, PRIMARY KEY(item_id, occurrence, step_id))')
    db.execute('CREATE TABLE IF NOT EXISTS family_requests (key TEXT PRIMARY KEY, digest TEXT, response TEXT, created TEXT)')
    db.commit()
    app.router.add_get('/api/family', get_items)
    app.router.add_post('/api/family/actions', write_item)
