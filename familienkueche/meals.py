"""Mealie through the existing HA integration; image bytes from local Mealie."""
import asyncio
import hashlib
import json
import re
from datetime import date, timedelta
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID

from aiohttp import ClientError, web

DEFAULT_ENTRY = ''
DEFAULT_IMAGE_BASE = 'http://a0d7b954-mealie:9001'


def recipe_id(value):
    return str(UUID(str(value)))


def recipe_summary(raw):
    rid = recipe_id(raw['recipe_id'])
    return {'id': rid, 'name': str(raw.get('name') or 'Ohne Titel'),
            'description': str(raw.get('description') or ''),
            'time': str(raw.get('total_time') or raw.get('prep_time') or ''),
            'servings': raw.get('recipe_servings'),
            'image': 'api/recipes/' + rid + '/image' if raw.get('image') else None}


def recipe_details(raw):
    result = recipe_summary(raw)
    ingredients = []
    for item in raw.get('ingredients') or []:
        text = item.get('display') or item.get('original_text')
        if not text:
            text = ' '.join(str(v) for v in [item.get('quantity'), (item.get('unit') or {}).get('name'),
                      (item.get('food') or {}).get('name'), item.get('note')] if v not in (None, ''))
        ingredients.append(str(text or 'Zutat ohne Beschreibung'))
    result['ingredients'] = ingredients
    result['steps'] = [str(item.get('text') or '') for item in raw.get('instructions') or []]
    url = raw.get('original_url') or ''
    parsed = urlsplit(url)
    result['sourceUrl'] = url if parsed.scheme in ('http', 'https') and parsed.hostname and not parsed.username else None
    return result


def normalize_plan(raw):
    output = []
    for entry in raw:
        if entry.get('entry_type') != 'dinner':
            continue
        r = recipe_summary(entry['recipe']) if entry.get('recipe') else None
        output.append({'id': str(int(entry['mealplan_id'])), 'date': date.fromisoformat(str(entry['mealplan_date'])).isoformat(),
                       'title': str(entry.get('title') or (r['name'] if r else 'Abendessen')),
                       'description': str(entry.get('description') or ''), 'recipe': r})
    return sorted(output, key=lambda x: (x['date'], x['id']))


def revision(entries):
    return hashlib.sha256(json.dumps(entries, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def chefkoch_url(value):
    if not isinstance(value, str) or len(value) > 2000:
        raise ValueError('Ungültiger Rezeptlink.')
    parsed = urlsplit(value.strip())
    if (parsed.scheme != 'https' or parsed.hostname not in ('chefkoch.de', 'www.chefkoch.de')
            or parsed.port not in (None, 443) or parsed.username or parsed.password
            or not re.fullmatch(r'/rezepte/\d+/[^\s]*', parsed.path)):
        raise ValueError('Bitte einen vollständigen HTTPS-Rezeptlink von Chefkoch einfügen.')
    return urlunsplit(('https', 'www.chefkoch.de', parsed.path, '', ''))


async def service(app, name, data, response=True):
    allowed = {'get_recipes', 'get_recipe', 'get_mealplan', 'import_recipe', 'set_mealplan', 'update_mealplan', 'delete_mealplan'}
    if name not in allowed:
        raise ValueError('Unsupported service')
    if not app['mealie_entry']:
        raise ValueError('Mealie-Integration bitte in den App-Optionen zuordnen.')
    payload = {'config_entry_id': app['mealie_entry'], **data}
    return await app['ha'].service('mealie', name, payload, response=response)


def remember(app, recipes):
    for r in recipes:
        app['recipe_ids'].add(r['id'])


async def plan_read(app, start, end):
    result = await service(app, 'get_mealplan', {'start_date': start.isoformat(), 'end_date': (end - timedelta(days=1)).isoformat()})
    return normalize_plan(result['mealplan'])


async def get_plan(request):
    try:
        start, end = date.fromisoformat(request.query['start']), date.fromisoformat(request.query['end'])
        if not 0 < (end - start).days <= 63:
            raise ValueError()
    except (KeyError, ValueError):
        return web.json_response({'error': 'Ungültiger Zeitraum.'}, status=400)
    try:
        entries = await plan_read(request.app, start, end)
        remember(request.app, [e['recipe'] for e in entries if e['recipe']])
        revisions = {}
        day = start
        while day < end:
            stamp = day.isoformat()
            revisions[stamp] = revision([e for e in entries if e['date'] == stamp])
            day += timedelta(days=1)
        return web.json_response({'entries': entries, 'revisions': revisions})
    except Exception:
        return web.json_response({'error': 'Der Essensplan konnte nicht aus Mealie geladen werden.'}, status=502)


async def get_recipes(request):
    query = request.query.get('q', '').strip()
    if len(query) > 100:
        return web.json_response({'error': 'Suchtext ist zu lang.'}, status=400)
    try:
        result = await service(request.app, 'get_recipes', {'search_terms': query, 'result_limit': 40})
        recipes = [recipe_summary(r) for r in result['recipes']['items']]
        remember(request.app, recipes)
        return web.json_response({'recipes': recipes, 'limit': 40})
    except Exception:
        return web.json_response({'error': 'Die Rezepte konnten nicht aus Mealie geladen werden.'}, status=502)


async def get_recipe(request):
    try:
        rid = recipe_id(request.match_info['recipe_id'])
    except ValueError:
        raise web.HTTPBadRequest()
    try:
        result = await service(request.app, 'get_recipe', {'recipe_id': rid})
        recipe = recipe_details(result['recipe'])
        remember(request.app, [recipe])
        return web.json_response({'recipe': recipe})
    except Exception:
        return web.json_response({'error': 'Das Rezept konnte nicht geladen werden.'}, status=502)


async def get_image(request):
    try:
        rid = recipe_id(request.match_info['recipe_id'])
    except ValueError:
        raise web.HTTPNotFound()
    if rid not in request.app['recipe_ids']:
        raise web.HTTPNotFound()
    url = request.app['mealie_image_base'] + '/api/media/recipes/' + rid + '/images/min-original.webp'
    try:
        # Mealie media is unauthenticated; never forward a Supervisor/HA token.
        async with request.app['ha'].session.get(url, allow_redirects=False) as response:
            if response.status != 200 or response.content_type not in ('image/webp', 'image/jpeg', 'image/png'):
                raise web.HTTPNotFound()
            chunks, size = [], 0
            async for chunk in response.content.iter_chunked(65536):
                size += len(chunk)
                if size > 3 * 1024 * 1024:
                    raise web.HTTPNotFound()
                chunks.append(chunk)
            return web.Response(body=b''.join(chunks), content_type=response.content_type)
    except (ClientError, OSError, asyncio.TimeoutError):
        raise web.HTTPNotFound()


async def meal_write(request):
    try:
        data = await request.json()
        action = data['action']
        key = request.headers.get('Idempotency-Key', '')
        if not re.fullmatch(r'[a-zA-Z0-9-]{16,100}', key):
            raise ValueError('Ungültige Anfragekennung.')
        if action == 'import':
            payload = {'url': chefkoch_url(data['url']), 'include_tags': False}
        elif action in ('plan', 'remove'):
            stamp = date.fromisoformat(data['date'])
            payload = {'date': stamp.isoformat(), 'entry_type': 'dinner'}
            target = str(int(data['targetId'])) if data.get('targetId') is not None else None
            expected = data['revision']
            if not isinstance(expected, str) or not re.fullmatch(r'[a-f0-9]{64}', expected):
                raise ValueError('Bitte den Essensplan aktualisieren.')
            if action == 'plan':
                payload['recipe_id'] = recipe_id(data['recipeId'])
            if action == 'remove' and target is None:
                raise ValueError('Kein Gericht ausgewählt.')
        else:
            raise ValueError('Unbekannte Aktion.')
    except (ValueError, KeyError, TypeError, AttributeError):
        return web.json_response({'error': 'Ungültige Eingabe. Bitte Datum, Rezept und Chefkoch-Link prüfen.'}, status=400)
    # Prefix prevents collision with calendar write IDs. Digest includes preconditions.
    key = 'meal:' + key
    digest = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
    async with request.app['write_lock']:
        db = request.app['db']
        previous = db.execute('SELECT digest, status FROM submissions WHERE key=?', (key,)).fetchone()
        if previous:
            if previous[0] != digest:
                return web.json_response({'error': 'Anfragekennung bereits verwendet.'}, status=409)
            if previous[1] == 'done':
                return web.json_response({'success': True})
            return web.json_response({'error': 'Ergebnis unklar. Bitte zuerst in Mealie prüfen.', 'uncertain': True}, status=409)
        if action != 'import':
            try:
                current = await plan_read(request.app, stamp, stamp + timedelta(days=1))
                if revision(current) != expected or (target is not None and not any(e['id'] == target for e in current)):
                    return web.json_response({'error': 'Der Essensplan wurde inzwischen geändert. Bitte aktualisieren.', 'conflict': True}, status=409)
                if action == 'plan':
                    await service(request.app, 'get_recipe', {'recipe_id': payload['recipe_id']})
            except Exception:
                return web.json_response({'error': 'Mealie nicht erreichbar. Es wurde nichts geändert.'}, status=503)
        db.execute('INSERT INTO submissions VALUES (?, ?, ?)', (key, digest, 'pending'))
        db.commit()
        try:
            if action == 'import':
                await service(request.app, 'import_recipe', payload)
            elif action == 'remove':
                await service(request.app, 'delete_mealplan', {'mealplan_id': target}, response=False)
            elif target is None:
                await service(request.app, 'set_mealplan', payload)
            else:
                await service(request.app, 'update_mealplan', {**payload, 'mealplan_id': target})
        except Exception:
            return web.json_response({'error': 'Mealie hat den Vorgang nicht sicher bestätigt. Bitte dort prüfen, bevor du ihn wiederholst.', 'uncertain': True}, status=502)
        db.execute('UPDATE submissions SET status=? WHERE key=?', ('done', key))
        db.commit()
    return web.json_response({'success': True})


def setup(app, options):
    entry = options.get('mealie_entry_id') or DEFAULT_ENTRY
    base = (options.get('mealie_image_base_url') or DEFAULT_IMAGE_BASE).rstrip('/')
    parsed = urlsplit(base)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path:
        raise ValueError('Ungültige Mealie-Bildadresse in der App-Konfiguration.')
    app['mealie_entry'], app['mealie_image_base'] = entry, base
    app['recipe_ids'] = set()
    app.router.add_get('/api/meals', get_plan)
    app.router.add_get('/api/recipes', get_recipes)
    app.router.add_get('/api/recipes/{recipe_id}', get_recipe)
    app.router.add_get('/api/recipes/{recipe_id}/image', get_image)
    app.router.add_post('/api/meals/actions', meal_write)
