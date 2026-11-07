"""Reviewed recipe ingredients -> the configured HA shopping list, no auto-replay."""
import asyncio
import hashlib
import json
import math
import re
from decimal import Decimal, ROUND_HALF_UP
from aiohttp import web
from meals import recipe_id, service, recipe_details
from shopping import read_list


def finite_positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def recipe_revision(recipe):
    return hashlib.sha256(json.dumps([recipe.get('recipe_servings'), recipe.get('ingredients')], sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def quantity_text(quantity):
    value = Decimal(str(quantity)).quantize(Decimal('.001'), rounding=ROUND_HALF_UP)
    if value == 0 and quantity > 0:
        return format(Decimal(str(quantity)), 'f').rstrip('0').rstrip('.').replace('.', ',')
    return format(value, 'f').rstrip('0').rstrip('.').replace('.', ',') if '.' in format(value, 'f') else str(value)


def build_preview(recipe, servings, current):
    if not finite_positive(servings) or servings > 100:
        raise ValueError('Portionszahl muss zwischen 0 und 100 liegen.')
    raw = recipe.get('ingredients') or []
    if len(raw) > 80:
        raise ValueError('Dieses Rezept hat mehr als 80 Zutaten. Bitte in kleineren Gruppen manuell übernehmen.')
    original = recipe_details(recipe)['ingredients']
    base = recipe.get('recipe_servings')
    base = base if finite_positive(base) else None
    opened = {' '.join(x['name'].casefold().split()) for x in current['items'] if not x['done']}
    items = []
    for index, entry in enumerate(raw):
        amount, food = entry.get('quantity'), (entry.get('food') or {}).get('name')
        scalable = base is not None and finite_positive(amount) and bool(food)
        text = original[index]
        if scalable:
            unit = (entry.get('unit') or {}).get('name') or ''
            text = ' '.join(x for x in [quantity_text(amount * servings / base), unit, str(food), str(entry.get('note') or '')] if x)
        # Without reliable structured amounts, retain the original ingredient text.
        items.append({'index': index, 'text': text, 'original': original[index], 'scalable': scalable,
                      'needsReview': servings != base and not scalable, 'tooLong': len(text) > 200,
                      'exists': ' '.join(text.casefold().split()) in opened})
    return {'recipeId': recipe_id(recipe['recipe_id']), 'recipeName': str(recipe.get('name') or 'Rezept'),
            'recipeRevision': recipe_revision(recipe), 'baseServings': base, 'servings': servings,
            'shoppingLabel': current['label'], 'canAdd': current['canAdd'], 'items': items}


async def load_recipe(app, rid):
    result = await service(app, 'get_recipe', {'recipe_id': rid})
    return result['recipe']


async def preview(request):
    try:
        rid = recipe_id(request.match_info['recipe_id'])
        servings = float(request.query.get('servings', '3'))
        if not finite_positive(servings) or servings > 100:
            raise ValueError()
    except (ValueError, TypeError):
        return web.json_response({'error': 'Ungültiges Rezept oder Portionszahl.'}, status=400)
    try:
        recipe = await load_recipe(request.app, rid)
        current = await read_list(request.app)
        return web.json_response(build_preview(recipe, servings, current))
    except Exception:
        return web.json_response({'error': 'Zutaten oder Einkaufsliste konnten nicht geladen werden. Bitte die Verbindung und die Portionszahl prüfen.'}, status=502)


async def transfer(request):
    try:
        data = await request.json()
        rid = recipe_id(data['recipeId'])
        servings = data['servings']
        if not finite_positive(servings) or servings > 100:
            raise ValueError()
        revision = data['recipeRevision']
        if not re.fullmatch(r'[a-f0-9]{64}', revision):
            raise ValueError()
        rows = data['items']
        if not isinstance(rows, list) or not 0 < len(rows) <= 80:
            raise ValueError()
        seen = set()
        for row in rows:
            idx, text = row['index'], row['text']
            if type(idx) is not int or idx < 0 or idx in seen or not isinstance(text, str) or not 0 < len(text.strip()) <= 200:
                raise ValueError()
            seen.add(idx)
        key = request.headers.get('Idempotency-Key', '')
        if not re.fullmatch(r'[a-zA-Z0-9-]{16,100}', key):
            raise ValueError()
    except (ValueError, KeyError, TypeError, AttributeError):
        return web.json_response({'error': 'Bitte Auswahl, Portionszahl und Zutaten prüfen (maximal 200 Zeichen je Zutat).'}, status=400)
    digest = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
    key = 'ingredients:' + key
    app = request.app
    async with app['write_lock']:
        db = app['db']
        old = db.execute('SELECT digest,status FROM submissions WHERE key=?', (key,)).fetchone()
        if old:
            if old[0] != digest:
                return web.json_response({'error': 'Anfragekennung bereits verwendet.'}, status=409)
            saved = db.execute('SELECT result FROM ingredient_receipts WHERE key=?', (key,)).fetchone()
            receipt = json.loads(saved[0]) if saved else {}
            if old[1] == 'done':
                return web.json_response(receipt)
            return web.json_response({**receipt, 'success': False, 'uncertain': True,
                'error': 'Vorgang nicht vollständig bestätigt. Bitte die Einkaufsliste prüfen. Es wird nichts automatisch wiederholt.'}, status=409)
        try:
            recipe, current = await asyncio.wait_for(asyncio.gather(load_recipe(app, rid), read_list(app)), timeout=25)
        except Exception:
            return web.json_response({'error': 'Rezept oder Einkaufsliste nicht erreichbar. Es wurde nichts gesendet.'}, status=503)
        if not current['canAdd']:
            return web.json_response({'error': 'Die gewählte Liste erlaubt keine neuen Artikel.'}, status=403)
        if recipe_revision(recipe) != revision or any(row['index'] >= len(recipe.get('ingredients') or []) for row in rows):
            return web.json_response({'error': 'Das Rezept wurde inzwischen geändert. Bitte die Zutatenvorschau neu öffnen.', 'conflict': True}, status=409)
        receipt = {'success': False, 'added': 0, 'skipped': 0, 'remaining': len(rows), 'shoppingLabel': current['label']}
        opened = {' '.join(x['name'].casefold().split()) for x in current['items'] if not x['done']}
        db.execute('INSERT INTO submissions VALUES (?,?,?)', (key, digest, 'pending'))
        db.execute('INSERT INTO ingredient_receipts VALUES (?,?)', (key, json.dumps(receipt)))
        db.commit()
        deadline = asyncio.get_running_loop().time() + 45
        for row in rows:
            text = row['text'].strip()
            normalized = ' '.join(text.casefold().split())
            if normalized in opened:
                receipt['skipped'] += 1
            else:
                if asyncio.get_running_loop().time() >= deadline:
                    receipt.update(error='Ein Teil wurde übernommen. Die verbleibenden Zutaten wurden wegen Zeitüberschreitung nicht gesendet.', uncertain=True)
                    db.execute('UPDATE ingredient_receipts SET result=? WHERE key=?', (json.dumps(receipt), key))
                    db.commit()
                    return web.json_response(receipt, status=502)
                try:
                    await asyncio.wait_for(app['ha'].service('todo', 'add_item', {'entity_id': app['shopping_entity'], 'item': text}, response=False), timeout=max(.01, min(15, deadline - asyncio.get_running_loop().time())))
                except Exception:
                    receipt.update(uncertain=True, error='Eine Zutat wurde nicht sicher bestätigt. Bitte die Liste prüfen; weitere Zutaten wurden nicht gesendet.')
                    db.execute('UPDATE ingredient_receipts SET result=? WHERE key=?', (json.dumps(receipt), key))
                    db.commit()
                    return web.json_response(receipt, status=502)
                receipt['added'] += 1
                opened.add(normalized)
            receipt['remaining'] -= 1
            db.execute('UPDATE ingredient_receipts SET result=? WHERE key=?', (json.dumps(receipt), key))
            db.commit()
        receipt['success'] = True
        db.execute('UPDATE ingredient_receipts SET result=? WHERE key=?', (json.dumps(receipt), key))
        db.execute('UPDATE submissions SET status=? WHERE key=?', ('done', key))
        db.commit()
    return web.json_response(receipt)


def setup(app):
    app['db'].execute('CREATE TABLE IF NOT EXISTS ingredient_receipts (key TEXT PRIMARY KEY, result TEXT)')
    app.router.add_get('/api/recipes/{recipe_id}/ingredients', preview)
    app.router.add_post('/api/ingredients/transfer', transfer)
