"""Combine the week's dinner ingredients conservatively before reviewed transfer."""
import asyncio
import hashlib
import json
import re
from datetime import date, timedelta
from decimal import Decimal
from aiohttp import web
from ingredients import build_preview, finite_positive, load_recipe, quantity_text, recipe_revision, saved_transfer, perform_transfer
from meals import plan_read, revision
from shopping import read_list


class PreviewError(ValueError):
    pass


def clean(value):
    return ' '.join(str(value or '').casefold().split())


def unit_family(name):
    units = {
        'g': ('mass', Decimal(1)), 'gramm': ('mass', Decimal(1)), 'gram': ('mass', Decimal(1)), 'grams': ('mass', Decimal(1)),
        'kg': ('mass', Decimal(1000)), 'kilogramm': ('mass', Decimal(1000)), 'kilogram': ('mass', Decimal(1000)),
        'ml': ('volume', Decimal(1)), 'milliliter': ('volume', Decimal(1)), 'millilitre': ('volume', Decimal(1)),
        'l': ('volume', Decimal(1000)), 'liter': ('volume', Decimal(1000)), 'litre': ('volume', Decimal(1000)),
        'el': ('tablespoon', Decimal(1)), 'esslöffel': ('tablespoon', Decimal(1)), 'tbsp': ('tablespoon', Decimal(1)),
        'tl': ('teaspoon', Decimal(1)), 'teelöffel': ('teaspoon', Decimal(1)), 'tsp': ('teaspoon', Decimal(1)),
        'stück': ('count', Decimal(1)), 'stueck': ('count', Decimal(1)), 'stk': ('count', Decimal(1)),
    }
    return units.get(clean(name), ('exact:' + clean(name), Decimal(1)))


def display_amount(amount, family, original_unit):
    if family == 'mass':
        return (amount / 1000, 'kg') if amount >= 1000 else (amount, 'g')
    if family == 'volume':
        return (amount / 1000, 'l') if amount >= 1000 else (amount, 'ml')
    return amount, {'count': 'Stück', 'tablespoon': 'EL', 'teaspoon': 'TL'}.get(family, original_unit)


def aggregate(entries, recipes, servings, current):
    groups = {}
    for entry in entries:
        r = recipes[entry['recipe']['id']]
        preview = build_preview(r, servings, current)
        for raw, item in zip(r.get('ingredients') or [], preview['items']):
            food = raw.get('food') or {}
            unit_name = str((raw.get('unit') or {}).get('name') or '').strip()
            family, factor = unit_family(unit_name)
            note = str(raw.get('note') or '').strip()
            if item['scalable']:
                identity = str(food.get('food_id') or food.get('id') or clean(food['name']))
                key = ('amount', identity, family, clean(note))
                amount = Decimal(str(raw['quantity'])) * Decimal(str(servings)) / Decimal(str(r['recipe_servings'])) * factor
                if key not in groups:
                    groups[key] = {'amount': Decimal(0), 'food': str(food['name']), 'family': family, 'unit': unit_name,
                                   'note': note, 'sources': [], 'count': 0, 'needsReview': False}
                row = groups[key];row['amount'] += amount
            else:
                key = ('text', clean(item['text']))
                if key not in groups:
                    groups[key] = {'original': item['text'], 'sources': [], 'count': 0, 'needsReview': item['needsReview']}
                row = groups[key]
                row['needsReview'] = row['needsReview'] or item['needsReview']
            row['count'] += 1
            row['sources'].append({'date': entry['date'], 'title': entry['title']})
    if len(groups) > 100:
        raise PreviewError('Mehr als 100 Zutaten nach dem Zusammenfassen. Bitte einzelne Rezepte getrennt übernehmen.')
    opened = {clean(x['name']) for x in current['items'] if not x['done']}
    output = []
    for row in groups.values():
        if 'amount' in row:
            amount, unit = display_amount(row['amount'], row['family'], row['unit'])
            text = ' '.join(x for x in [quantity_text(amount), unit, row['food'], row['note']] if x)
        else:
            text = (str(row['count']) + ' × ' if row['count'] > 1 else '') + row['original']
            row['needsReview'] = row['needsReview'] or row['count'] > 1
        output.append({'index': len(output), 'text': text, 'exists': clean(text) in opened,
                       'tooLong': len(text) > 200, 'needsReview': row['needsReview'], 'scalable': 'amount' in row,
                       'sources': row['sources'], 'combined': row['count'] > 1})
    return output


async def context(app, week, servings):
    entries = await plan_read(app, week, week + timedelta(days=7))
    dishes = [entry for entry in entries if entry['recipe']]
    if len(dishes) > 21:
        raise PreviewError('Mehr als 21 geplante Gerichte. Bitte einzelne Rezepte getrennt übernehmen.')
    ids = sorted({entry['recipe']['id'] for entry in dishes})
    if len(ids) > 14:
        raise PreviewError('Mehr als 14 verschiedene Rezepte. Bitte einzelne Rezepte getrennt übernehmen.')
    semaphore = asyncio.Semaphore(3)
    async def one(rid):
        async with semaphore:
            return rid, await load_recipe(app, rid)
    recipes = dict(await asyncio.gather(*(one(rid) for rid in ids)))
    if sum(len(r.get('ingredients') or []) for r in recipes.values()) > 500:
        raise PreviewError('Zu viele Rezeptzutaten. Bitte einzelne Rezepte getrennt übernehmen.')
    current = await read_list(app)
    digest = hashlib.sha256(json.dumps([week.isoformat(), servings, app['shopping_entity'], revision(entries),
        [(rid, recipe_revision(recipes[rid])) for rid in ids]], sort_keys=True).encode()).hexdigest()
    return {'week': week.isoformat(), 'servings': servings, 'batchRevision': digest, 'recipeName': 'Wocheneinkauf',
            'shoppingLabel': current['label'], 'canAdd': current['canAdd'], 'weekly': True,
            'dishes': [{'date': e['date'], 'title': e['title'], 'hasRecipe': bool(e['recipe'])} for e in entries],
            'items': aggregate(dishes, recipes, servings, current)}, current


def inputs(week, servings):
    week = date.fromisoformat(week)
    if week.weekday() != 0 or not finite_positive(servings) or servings > 100:
        raise ValueError()
    return week


async def preview(request):
    try:
        servings = float(request.query.get('servings', '3'))
        week = inputs(request.query['week'], servings)
    except (ValueError, KeyError, TypeError):
        return web.json_response({'error': 'Bitte eine Kalenderwoche und gültige Portionszahl wählen.'}, status=400)
    try:
        data, _ = await asyncio.wait_for(context(request.app, week, servings), timeout=30)
        return web.json_response(data)
    except PreviewError as exc:
        return web.json_response({'error': str(exc)}, status=400)
    except Exception:
        return web.json_response({'error': 'Der Wochenplan, ein Rezept oder die Einkaufsliste konnte nicht vollständig geladen werden.'}, status=502)


async def transfer(request):
    try:
        data = await request.json()
        week = inputs(data['week'], data['servings'])
        rows, expected = data['items'], data['batchRevision']
        if not re.fullmatch(r'[a-f0-9]{64}', expected) or not isinstance(rows, list) or not 0 < len(rows) <= 100:
            raise ValueError()
        indexes = set()
        for row in rows:
            index, text = row['index'], row['text']
            if type(index) is not int or index < 0 or index in indexes or not isinstance(text, str) or not 0 < len(text.strip()) <= 200:
                raise ValueError()
            indexes.add(index)
        key = request.headers.get('Idempotency-Key', '')
        if not re.fullmatch(r'[a-zA-Z0-9-]{16,100}', key):
            raise ValueError()
    except (KeyError, ValueError, TypeError, AttributeError):
        return web.json_response({'error': 'Bitte Woche, Portionszahl und Zutatenauswahl prüfen.'}, status=400)
    key = 'weekly:' + key
    digest = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
    app = request.app
    async with app['write_lock']:
        saved = saved_transfer(app, key, digest)
        if saved is not None:
            return saved
        try:
            fresh, current = await asyncio.wait_for(context(app, week, data['servings']), timeout=30)
        except Exception:
            return web.json_response({'error': 'Wochenplan oder Zutaten konnten nicht geprüft werden. Es wurde nichts gesendet.'}, status=503)
        if expected != fresh['batchRevision'] or any(row['index'] >= len(fresh['items']) for row in rows):
            return web.json_response({'error': 'Wochenplan, Rezeptzutaten oder Zielliste wurden geändert. Bitte die Vorschau neu öffnen.', 'conflict': True}, status=409)
        if not current['canAdd']:
            return web.json_response({'error': 'Diese Liste erlaubt keine neuen Artikel.'}, status=403)
        return await perform_transfer(app, key, digest, rows, current)


def setup(app):
    app.router.add_get('/api/ingredients/week', preview)
    app.router.add_post('/api/ingredients/week/transfer', transfer)
