"""A single configured HA to-do list, addressed by UID rather than item text."""
import hashlib
import json
import re
from datetime import datetime
from zoneinfo import ZoneInfo
from aiohttp import web


def item_revision(raw):
    fields = {key: raw.get(key) for key in ('uid', 'summary', 'status', 'description')}
    return hashlib.sha256(json.dumps(fields, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def normalize_items(raw):
    items, seen = [], set()
    for entry in raw:
        uid, summary, status = entry.get('uid'), entry.get('summary'), entry.get('status')
        if not isinstance(uid, str) or not uid or uid in seen or not isinstance(summary, str) or status not in ('needs_action', 'completed'):
            raise ValueError('Ungültige Einträge in der Einkaufsliste.')
        seen.add(uid)
        items.append({'id': uid, 'name': summary, 'done': status == 'completed',
                      'description': str(entry.get('description') or ''), 'revision': item_revision(entry)})
    return items


async def read_list(app):
    entity = app['shopping_entity']
    state = await app['ha'].request('GET', 'states/' + entity)
    if state.get('state') in ('unknown', 'unavailable', None):
        raise ValueError('Einkaufsliste momentan nicht verfügbar.')
    attrs = state.get('attributes', {})
    features = int(attrs.get('supported_features') or 0)
    response = await app['ha'].service('todo', 'get_items', {'entity_id': entity, 'status': ['needs_action', 'completed']}, response=True)
    items = normalize_items(response[entity]['items'])
    return {'items': items, 'label': str(attrs.get('friendly_name') or 'Einkaufsliste').strip(),
            'canAdd': bool(features & 1), 'canRemove': bool(features & 2), 'canUpdate': bool(features & 4),
            'fetchedAt': datetime.now(ZoneInfo('Europe/Berlin')).isoformat()}


async def get_list(request):
    try:
        return web.json_response(await read_list(request.app))
    except Exception:
        return web.json_response({'error': 'Die Einkaufsliste konnte nicht aus Home Assistant geladen werden.'}, status=502)


def validate_action(data):
    action = data['action']
    payload = {}
    if action in ('add', 'rename'):
        name = data['name']
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 200:
            raise ValueError('Ungültiger Artikelname.')
        payload['name'] = name.strip()
    if action in ('status', 'rename', 'remove'):
        uid, rev = data['id'], data['revision']
        if not isinstance(uid, str) or not 0 < len(uid) <= 512 or not re.fullmatch(r'[a-f0-9]{64}', rev):
            raise ValueError('Ungültiger Eintrag.')
        payload.update(id=uid, revision=rev)
    if action == 'status':
        if not isinstance(data['done'], bool):
            raise ValueError('Ungültiger Status.')
        payload['done'] = data['done']
    if action not in ('add', 'status', 'rename', 'remove'):
        raise ValueError('Ungültige Aktion.')
    return action, payload


async def shopping_write(request):
    try:
        data = await request.json()
        action, payload = validate_action(data)
        key = request.headers.get('Idempotency-Key', '')
        if not re.fullmatch(r'[a-zA-Z0-9-]{16,100}', key):
            raise ValueError('Ungültige Anfragekennung.')
    except (ValueError, KeyError, TypeError, AttributeError):
        return web.json_response({'error': 'Bitte Artikelname und Eintrag prüfen.'}, status=400)
    key = 'shopping:' + key
    digest = hashlib.sha256(json.dumps([action, payload], sort_keys=True).encode()).hexdigest()
    async with request.app['write_lock']:
        db = request.app['db']
        previous = db.execute('SELECT digest, status FROM submissions WHERE key=?', (key,)).fetchone()
        if previous:
            if previous[0] != digest:
                return web.json_response({'error': 'Anfragekennung bereits verwendet.'}, status=409)
            if previous[1] == 'done':
                return web.json_response({'success': True})
            return web.json_response({'error': 'Ergebnis unklar. Bitte zuerst die Liste aktualisieren und in Home Assistant prüfen.', 'uncertain': True}, status=409)
        try:
            current = await read_list(request.app)
        except Exception:
            return web.json_response({'error': 'Einkaufsliste nicht erreichbar. Es wurde nichts gesendet.'}, status=503)
        needed = 'canAdd' if action == 'add' else 'canRemove' if action == 'remove' else 'canUpdate'
        if not current[needed]:
            return web.json_response({'error': 'Diese Liste unterstützt die Aktion nicht.'}, status=403)
        if action == 'add':
            name = ' '.join(payload['name'].casefold().split())
            if any(not item['done'] and ' '.join(item['name'].casefold().split()) == name for item in current['items']):
                return web.json_response({'error': 'Dieser Artikel steht bereits offen auf der Liste.', 'conflict': True}, status=409)
            service, service_data = 'add_item', {'item': payload['name']}
        else:
            item = next((x for x in current['items'] if x['id'] == payload['id']), None)
            if not item or item['revision'] != payload['revision']:
                return web.json_response({'error': 'Dieser Eintrag wurde inzwischen geändert. Bitte aktualisieren.', 'conflict': True}, status=409)
            service_data = {'item': item['id']}
            if action == 'status':
                service = 'update_item'
                service_data['status'] = 'completed' if payload['done'] else 'needs_action'
            elif action == 'rename':
                service = 'update_item'
                service_data['rename'] = payload['name']
            else:
                service = 'remove_item'
        db.execute('INSERT INTO submissions VALUES (?, ?, ?)', (key, digest, 'pending'))
        db.commit()
        try:
            await request.app['ha'].service('todo', service, {'entity_id': request.app['shopping_entity'], **service_data}, response=False)
        except Exception:
            return web.json_response({'error': 'Home Assistant hat die Änderung nicht sicher bestätigt. Bitte die Liste prüfen, bevor du den Vorgang wiederholst.', 'uncertain': True}, status=502)
        db.execute('UPDATE submissions SET status=? WHERE key=?', ('done', key))
        db.commit()
    return web.json_response({'success': True})


def setup(app, options):
    entity = options.get('shopping_entity') or 'todo.einkaufsliste'
    if not re.fullmatch(r'todo\.[a-z0-9_]+', entity):
        raise ValueError('Ungültige Einkaufslisten-Entität in der App-Konfiguration.')
    app['shopping_entity'] = entity
    app.router.add_get('/api/shopping', get_list)
    app.router.add_post('/api/shopping/actions', shopping_write)
