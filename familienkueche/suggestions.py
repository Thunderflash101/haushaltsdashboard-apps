"""Rank a bounded Mealie recipe pool using labels, cooking dates and plans."""
import asyncio
import hashlib
import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from aiohttp import web
from meals import service, recipe_summary, remember

TZ = ZoneInfo('Europe/Berlin')


def plan_recipes(raw):
    result = []
    for entry in raw:
        recipe = entry.get('recipe') or {}
        rid = recipe.get('recipe_id')
        if rid:
            result.append((str(rid), date.fromisoformat(str(entry['mealplan_date'])).isoformat()))
    return result


def rank_recipes(recipes, history, planned, today, week, shuffle=0, vegetarian=False, quick=False, favorites=False):
    recent = {}
    for rid, stamp in history:
        if stamp < today.isoformat():
            recent[rid] = max(recent.get(rid, ''), stamp)
    plans = {}
    for rid, stamp in planned:
        plans.setdefault(rid, []).append(stamp)
    output = []
    for recipe in recipes:
        if vegetarian and not recipe['vegetarian'] or favorites and not recipe['favorite']:
            continue
        if quick and (recipe['minutes'] is None or recipe['minutes'] >= 30):
            continue
        rid = recipe['id']
        cooked = recipe.get('lastMade')
        cooked = cooked if cooked and cooked <= today.isoformat() else None
        last = max(filter(None, [recent.get(rid), cooked]), default=None)
        source = 'cooked' if last and cooked == last else 'planned' if last else None
        days = (today - date.fromisoformat(last)).days if last else None
        penalty = 90 if days is not None and days <= 7 else max(0, 29 - days) * 2 if days is not None else 0
        dates = sorted(set(plans.get(rid, [])))
        score = (40 if recipe['favorite'] else 0) - penalty - (110 if dates else 0)
        noise = int(hashlib.sha256((rid + today.isoformat() + week + str(shuffle)).encode()).hexdigest()[:8], 16) / 0xffffffff
        output.append({**recipe, 'lastSeen': last, 'lastSeenSource': source, 'plannedDates': dates, '_rank': score + noise * 15})
    output.sort(key=lambda x: (-x['_rank'], x['name'].casefold(), x['id']))
    for recipe in output:
        recipe.pop('_rank')
    return output


async def get_suggestions(request):
    try:
        week = date.fromisoformat(request.query['week'])
        if week.weekday() != 0:
            raise ValueError()
        query = request.query.get('q', '').strip()
        if len(query) > 100:
            raise ValueError()
        flags = {}
        for name in ('vegetarian', 'quick', 'favorites'):
            value = request.query.get(name, '0')
            if value not in ('0', '1'):
                raise ValueError()
            flags[name] = value == '1'
        shuffle = int(request.query.get('shuffle', '0'))
        if not 0 <= shuffle <= 1000000:
            raise ValueError()
    except (KeyError, ValueError):
        return web.json_response({'error': 'Ungültige Vorschlagsfilter oder Kalenderwoche.'}, status=400)
    today = datetime.now(TZ).date()
    app = request.app
    results = await asyncio.gather(
        service(app, 'get_recipes', {'search_terms': query, 'result_limit': 100}),
        service(app, 'get_mealplan', {'start_date': (today-timedelta(days=28)).isoformat(), 'end_date': (today-timedelta(days=1)).isoformat()}),
        service(app, 'get_mealplan', {'start_date': week.isoformat(), 'end_date': (week+timedelta(days=6)).isoformat()}),
        return_exceptions=True)
    if isinstance(results[0], Exception):
        return web.json_response({'error': 'Vorschläge konnten nicht aus Mealie geladen werden.'}, status=502)
    warnings = []
    try:
        recipes = [recipe_summary(raw) for raw in results[0]['recipes']['items']]
        history = plan_recipes(results[1]['mealplan']) if not isinstance(results[1], Exception) else []
        planned = plan_recipes(results[2]['mealplan']) if not isinstance(results[2], Exception) else []
        if isinstance(results[1], Exception):
            warnings.append('Frühere Essenspläne konnten nicht geladen werden; Abwechslung berücksichtigt derzeit nur vorhandene Kochdaten.')
        if isinstance(results[2], Exception):
            warnings.append('Der Wochenplan konnte für die Vorschläge nicht geprüft werden.')
        ranked = rank_recipes(recipes, history, planned, today, week.isoformat(), shuffle=shuffle, **flags)
        remember(app, recipes)
        return web.json_response({'recipes': ranked[:12], 'matches': len(ranked), 'poolSize': len(recipes),
                                  'limit': 100, 'warnings': warnings, 'favoriteTag': 'Familienfavorit', 'today': today.isoformat()})
    except (ValueError, KeyError, TypeError):
        return web.json_response({'error': 'Die Rezeptmerkmale oder Essensplandaten konnten nicht ausgewertet werden.'}, status=502)


def setup(app):
    app.router.add_get('/api/suggestions', get_suggestions)
