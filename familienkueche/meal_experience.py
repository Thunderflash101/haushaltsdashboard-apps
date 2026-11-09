"""Shared recipe learning, cooked history and reviewable three-day plans."""
import asyncio
import hashlib
import json
import re
import uuid
from datetime import date, datetime, time, timedelta

from aiohttp import web
from family import receipt_key, saved_response, save_response
from server import TZ


def today():
    return datetime.now(TZ).date().isoformat()


def key_for(recipe, app=None):
    from meal_ai import recipe_url
    url = recipe_url(recipe.get('url') or recipe.get('sourceUrl'))
    if url: return 'u:' + url
    ident = str(uuid.UUID(recipe['id']))
    if app is not None and not recipe.get('sourceUrl'):
        alias = app['db'].execute('SELECT recipe_key FROM meal_aliases WHERE id=?', (ident,)).fetchone()
        if alias: return alias[0]
    return 'm:' + ident


def remember(app, recipes):
    db = app['db']
    for recipe in recipes:
        try: key = key_for(recipe, app)
        except (ValueError, KeyError, TypeError): continue
        alias_data = {}
        if key.startswith('u:') and recipe.get('id'):
            try: alias = 'm:' + str(uuid.UUID(recipe['id']))
            except (ValueError, TypeError): alias = None
            if alias:
                db.execute('INSERT INTO meal_aliases VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET recipe_key=excluded.recipe_key', (alias[2:], key))
                previous = db.execute('SELECT data FROM meal_catalog WHERE key=?', (alias,)).fetchone()
                if previous:
                    alias_data = json.loads(previous[0])
                    db.execute('INSERT OR IGNORE INTO meal_feedback SELECT ?, rating, skip_date, revision FROM meal_feedback WHERE key=?', (key, alias))
                    db.execute('INSERT OR IGNORE INTO meal_cooked SELECT ?, day FROM meal_cooked WHERE key=?', (key, alias))
                    db.execute('DELETE FROM meal_feedback WHERE key=?', (alias,))
                    db.execute('DELETE FROM meal_cooked WHERE key=?', (alias,))
                    db.execute('DELETE FROM meal_catalog WHERE key=?', (alias,))
        recipe['recipeKey'] = key
        if key.startswith('u:') and not recipe.get('sourceUrl') and not recipe.get('url'): recipe['sourceUrl'] = key[2:]
        old = db.execute('SELECT data FROM meal_catalog WHERE key=?', (key,)).fetchone()
        stored = {**alias_data, **(json.loads(old[0]) if old else {}), **recipe}
        db.execute('INSERT INTO meal_catalog VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data, updated=excluded.updated',
                   (key, json.dumps(stored, ensure_ascii=False), datetime.now(TZ).isoformat()))
    db.execute('DELETE FROM meal_catalog WHERE key NOT IN (SELECT key FROM meal_catalog ORDER BY updated DESC LIMIT 2000)')
    db.commit()


def settings(app):
    row = app['db'].execute('SELECT data, revision FROM meal_preferences WHERE id=1').fetchone()
    return (json.loads(row[0]), row[1]) if row else (app['meal_ai_profile'], 0)


def feedback(app, key):
    row = app['db'].execute('SELECT rating, skip_date, revision FROM meal_feedback WHERE key=?', (key,)).fetchone()
    cooked = app['db'].execute('SELECT MAX(day) FROM meal_cooked WHERE key=?', (key,)).fetchone()[0]
    return dict(rating=row[0] if row else 'neutral', skipped=bool(row and row[1] == today()),
                revision=row[2] if row else 0, lastCooked=cooked, cookedToday=cooked == today())


def context(app):
    result = {'liked': [], 'disliked': [], 'skippedToday': [], 'recentlyCooked': [], 'favorites': []}
    db = app['db']
    for key, raw in db.execute('SELECT key, data FROM meal_catalog ORDER BY updated DESC LIMIT 1000'):
        recipe = json.loads(raw); name = recipe.get('name') or recipe.get('title')
        if not name: continue
        f = feedback(app, key)
        if f['rating'] == 'like': result['liked'].append(name)
        if f['rating'] == 'dislike': result['disliked'].append(name)
        if f['skipped']: result['skippedToday'].append(name)
        if f['lastCooked'] and f['lastCooked'] >= (date.fromisoformat(today())-timedelta(days=14)).isoformat():
            result['recentlyCooked'].append(name)
        if recipe.get('favorite'): result['favorites'].append(name)
    return {k: sorted(set(v))[:16] for k, v in result.items()}


def decorate(app, result):
    if not result: return result
    result = json.loads(json.dumps(result))
    from meal_ai import preference_score, avoided, varied_recipes
    profile, _ = settings(app)
    visible = []
    for recipe in result.get('recipes', []) + result.pop('alternatives', []):
        key = key_for(recipe); f = feedback(app, key)
        recipe.update(recipeKey=key, feedback=f)
        if f['rating'] == 'dislike' or f['skipped'] or avoided(recipe, profile): continue
        recipe['discovery'] = not (f['rating'] == 'like' or preference_score(recipe, profile['preferred']))
        visible.append(recipe)
    visible.sort(key=lambda r: (r['feedback']['rating'] != 'like', bool(r['feedback']['lastCooked'] and r['feedback']['lastCooked'] >= (date.fromisoformat(today())-timedelta(days=14)).isoformat())))
    result['recipes'] = varied_recipes(visible, result.get('mode', 'mixed'), profile['preferred'])
    return result


async def get_state(request):
    profile, revision = settings(request.app)
    ratings = []
    for key, raw in request.app['db'].execute('SELECT key, data FROM meal_catalog WHERE key IN (SELECT key FROM meal_feedback) ORDER BY updated DESC LIMIT 200'):
        recipe = json.loads(raw); f = feedback(request.app, key)
        if f['rating'] != 'neutral' or f['skipped'] or f['lastCooked']:
            ratings.append(dict(recipeKey=key, title=recipe.get('name') or recipe.get('title'), feedback=f))
    return web.json_response({'profile': profile, 'profileRevision': revision, 'learning': context(request.app), 'ratings': ratings})


async def actions(request):
    app, db = request.app, request.app['db']
    try:
        data = await request.json(); action = data['action']
        key = receipt_key(request, 'meal-experience')
        digest = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
        if action == 'profile':
            from meal_ai import taste_profile
            profile = taste_profile({'meal_ai_preferred_dishes': data['preferred'], 'meal_ai_avoid': data['avoid']})
            expected = data['revision']
        elif action in ('rate', 'cooked'):
            target = data['recipeKey']; expected = data['revision']
            if not isinstance(target, str) or not db.execute('SELECT 1 FROM meal_catalog WHERE key=?', (target,)).fetchone():
                raise ValueError()
            if action == 'rate' and data.get('rating') not in ('like', 'skip', 'dislike', 'neutral'): raise ValueError()
            if action == 'cooked' and type(data.get('done')) is not bool: raise ValueError()
        else: raise ValueError()
        if type(expected) is not int or expected < 0: raise ValueError()
    except (KeyError, ValueError, TypeError):
        return web.json_response({'error': 'Bitte Auswahl und Angaben prüfen.'}, status=400)
    async with app['write_lock']:
        saved = saved_response(db, key, digest)
        if saved is not None: return saved
        current = settings(app)[1] if action == 'profile' else feedback(app, target)['revision']
        if current != expected:
            return web.json_response({'error': 'Die Auswahl wurde inzwischen geändert. Bitte neu laden.', 'conflict': True}, status=409)
        with db:
            if action == 'profile':
                db.execute('INSERT INTO meal_preferences VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, revision=excluded.revision',
                           (json.dumps(profile), current+1))
                result = dict(success=True, profile=profile, profileRevision=current+1)
            else:
                old = feedback(app, target)
                row = db.execute('SELECT skip_date FROM meal_feedback WHERE key=?', (target,)).fetchone()
                rating, skip = old['rating'], row[0] if row else ''
                if action == 'rate':
                    if data['rating'] == 'skip': skip = today()
                    else: rating, skip = data['rating'], ''
                else:
                    if data['done']: db.execute('INSERT OR IGNORE INTO meal_cooked VALUES (?, ?)', (target, today()))
                    else: db.execute('DELETE FROM meal_cooked WHERE key=? AND day=?', (target, today()))
                db.execute('INSERT INTO meal_feedback VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET rating=excluded.rating, skip_date=excluded.skip_date, revision=excluded.revision',
                           (target, rating, skip, current+1))
                result = dict(success=True, recipeKey=target, feedback=feedback(app, target))
            save_response(db, key, digest, result)
    return web.json_response(result)


async def get_feedback(request):
    key = request.query.get('key', '')
    if not request.app['db'].execute('SELECT 1 FROM meal_catalog WHERE key=?', (key,)).fetchone():
        return web.json_response({'error': 'Rezept bitte neu laden.'}, status=404)
    return web.json_response({'recipeKey': key, 'feedback': feedback(request.app, key)})


def common_ingredients(a, b):
    from meal_ai import simple
    ignored = {'salz', 'pfeffer', 'wasser', 'ol', 'zucker', 'butter'}
    def terms(recipe):
        return {simple(x).strip() for x in recipe.get('ingredientNames', []) if simple(x).strip() not in ignored}
    return sorted(terms(a) & terms(b))


def choose_plan(pool, days, busy, shuffle=0):
    from meal_ai import dish_signature
    chosen, used = [], set()
    for i, day in enumerate(days):
        eligible = [r for r in pool if r['id'] not in used]
        if not eligible: break
        previous = chosen[-1]['recipe'] if chosen else None
        def score(r):
            quick = r.get('minutes') is not None and r['minutes'] <= 30
            shared = len(common_ingredients(previous, r)) if previous else 0
            repeated = bool(previous and dish_signature({'title': previous['name'], 'matches': []})[1] ==
                            dish_signature({'title': r['name'], 'matches': []})[1])
            noise = int(hashlib.sha256((r['id']+day+str(shuffle)).encode()).hexdigest()[:4], 16)/65535
            recent = r.get('localCooked') and r['localCooked'] >= (date.fromisoformat(today())-timedelta(days=14)).isoformat()
            return (100 if busy.get(day) and not quick else 0) + (30 if recent else 0) + (10 if repeated else 0) - min(shared, 3)*3 - (5 if r.get('favorite') or r.get('localLiked') else 0) - (3 if r.get('tasteScore') else 0) + noise
        recipe = min(eligible, key=score); used.add(recipe['id'])
        chosen.append(dict(date=day, recipe=recipe, busy=busy.get(day), shared=common_ingredients(previous, recipe) if previous else []))
    return chosen


async def draft(request):
    from meals import service, recipe_summary, recipe_details, plan_read, remember as remember_meals, revision
    from meal_ai import avoided
    app = request.app
    try:
        start = date.fromisoformat(request.query['start']); shuffle = int(request.query.get('shuffle', '0'))
        if not date.fromisoformat(today()) <= start <= date.fromisoformat(today())+timedelta(days=60) or not 0 <= shuffle <= 10000: raise ValueError()
    except (ValueError, KeyError): return web.json_response({'error': 'Bitte einen kommenden Starttag wählen.'}, status=400)
    try:
        collection, current = await asyncio.wait_for(asyncio.gather(
            service(app, 'get_recipes', {'search_terms': '', 'result_limit': 100}), plan_read(app, start, start+timedelta(days=7))), 8)
        recipes = [recipe_summary(r) for r in collection['recipes']['items']]
    except Exception: return web.json_response({'error': 'Mealie-Sammlung und vorhandenen Plan bitte zuerst laden.'}, status=502)
    remember_meals(app, recipes)
    days = [(start+timedelta(days=i)).isoformat() for i in range(7)]
    days = [d for d in days if not any(e['date'] == d for e in current)][:3]
    profile, _ = settings(app)
    recipes = [r for r in recipes if not (feedback(app, r['recipeKey'])['rating'] == 'dislike' or feedback(app, r['recipeKey'])['skipped'])]
    recipes.sort(key=lambda r: (not (r['favorite'] or feedback(app, r['recipeKey'])['rating'] == 'like'),
                               bool(feedback(app, r['recipeKey'])['lastCooked'] and feedback(app, r['recipeKey'])['lastCooked'] >= (date.fromisoformat(today())-timedelta(days=14)).isoformat()), r['name']))
    slots = asyncio.Semaphore(4)
    async def detail(r):
        async with slots:
            try:
                raw = (await asyncio.wait_for(service(app, 'get_recipe', {'recipe_id': r['id']}), 3))['recipe']
                value = recipe_details(raw)
                value['ingredientNames'] = [str((x.get('food') or {}).get('name') or x.get('original_text') or x.get('display') or '')[:120] for x in raw.get('ingredients', [])]
                return value
            except Exception: return {**r, 'ingredients': [], 'ingredientNames': []}
    pool = await asyncio.gather(*(detail(r) for r in recipes[:16]))
    pool = [r for r in pool if not avoided({'title': r['name'], 'matches': [], 'ingredients': r.get('ingredients', [])}, profile)]
    remember_meals(app, pool)
    from meal_ai import preference_score
    for recipe in pool:
        f = feedback(app, recipe['recipeKey'])
        recipe.update(localCooked=f['lastCooked'], localLiked=f['rating'] == 'like',
                      tasteScore=preference_score({'title': recipe['name'], 'matches': [], 'ingredients': recipe.get('ingredients', [])}, profile['preferred']))
    busy = {d: None for d in days}
    warnings = []
    try:
        events = await asyncio.wait_for(asyncio.gather(*(app['ha'].events(s['entity'], start, start+timedelta(days=7)) for s in app['sources'] if s['key'] in ('tina', 'joern'))), 3)
        from server import parse_boundary
        for day in days:
            count = 0; minutes = 0
            for entries in events:
                for event in entries:
                    begin, all_day = parse_boundary(event['start']); end, _ = parse_boundary(event['end'])
                    overlap = (min(end, datetime.combine(date.fromisoformat(day), time(21), TZ)) -
                               max(begin, datetime.combine(date.fromisoformat(day), time(16), TZ))).total_seconds()/60
                    if not all_day and overlap > 0:
                        count += 1; minutes += overlap
            busy[day] = count >= 2 or minutes >= 120
    except Exception: warnings.append('Kalender konnte für die Zeitplanung nicht geprüft werden.')
    selected = choose_plan(pool, days, busy, shuffle)
    if len(selected) < 3: warnings.append('Weniger als drei freie Tage oder passende gespeicherte Rezepte verfügbar.')
    for item in selected:
        item['revision'] = revision([e for e in current if e['date'] == item['date']])
    ident = uuid.uuid4().hex
    result = dict(id=ident, entries=selected, pool=pool, warnings=warnings, profileRevision=settings(app)[1])
    with app['db']:
        app['db'].execute('INSERT INTO meal_drafts VALUES (?, ?, ?)', (ident, json.dumps(result), datetime.now(TZ).isoformat()))
        app['db'].execute('DELETE FROM meal_drafts WHERE created < ?', ((datetime.now(TZ)-timedelta(days=2)).isoformat(),))
    return web.json_response(result)


async def apply_draft(request):
    from meals import service, plan_read, revision
    app, db = request.app, request.app['db']
    try:
        data = await request.json(); key = receipt_key(request, 'meal-draft')
        row = db.execute('SELECT data FROM meal_drafts WHERE id=?', (data['id'],)).fetchone()
        if not row or data.get('confirm') is not True: raise ValueError()
        original = json.loads(row[0]); requested = data['entries']
        if not isinstance(requested, list) or not 1 <= len(requested) <= 3: raise ValueError()
        allowed = {r['id']: r for r in original['pool']}; dates = {e['date']: e for e in original['entries']}
        if len({x['date'] for x in requested}) != len(requested): raise ValueError()
        if len({x['recipeId'] for x in requested}) != len(requested): raise ValueError()
        for item in requested:
            if item['date'] not in dates or item['recipeId'] not in allowed or item['date'] < today(): raise ValueError()
        digest = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
        # An ambiguous draft cannot be replayed using a fresh client request ID.
        key = 'meal-draft:' + data['id']
    except (KeyError, ValueError, TypeError): return web.json_response({'error': 'Entwurf bitte neu laden.'}, status=400)
    async with app['write_lock']:
        previous = db.execute('SELECT digest, status FROM submissions WHERE key=?', (key,)).fetchone()
        if previous:
            if previous != (digest, 'done'):
                return web.json_response({'error': 'Übernahme bereits versucht. Bitte zuerst den aktuellen Plan prüfen.', 'uncertain': True}, status=409)
            return web.json_response({'success': True})
        if settings(app)[1] != original['profileRevision'] or any(
                feedback(app, key_for(allowed[x['recipeId']], app))['rating'] == 'dislike' or feedback(app, key_for(allowed[x['recipeId']], app))['skipped'] for x in requested):
            return web.json_response({'error': 'Euer Geschmack oder eine Bewertung wurde geändert. Bitte den Entwurf neu erstellen.', 'conflict': True}, status=409)
        try:
            start = date.fromisoformat(min(x['date'] for x in requested)); end = date.fromisoformat(max(x['date'] for x in requested))+timedelta(days=1)
            current = await plan_read(app, start, end)
            if any(revision([e for e in current if e['date'] == x['date']]) != dates[x['date']]['revision'] for x in requested):
                return web.json_response({'error': 'Ein Tag wurde inzwischen belegt. Bitte den Entwurf neu erstellen.', 'conflict': True}, status=409)
        except Exception: return web.json_response({'error': 'Plan nicht erreichbar. Es wurde nichts gesendet.'}, status=503)
        with db: db.execute('INSERT INTO submissions VALUES (?, ?, ?)', (key, digest, 'pending'))
        done = []
        for item in requested:
            try:
                day = date.fromisoformat(item['date'])
                current = await plan_read(app, day, day+timedelta(days=1))
                if revision([e for e in current if e['date'] == item['date']]) != dates[item['date']]['revision']: raise ValueError('Changed day')
                await service(app, 'set_mealplan', {'date': item['date'], 'entry_type': 'dinner', 'recipe_id': item['recipeId']})
                done.append(item['date'])
            except Exception:
                return web.json_response({'error': 'Übernahme nicht vollständig bestätigt. Bitte den Plan prüfen; nicht erneut übernehmen.', 'applied': done, 'uncertain': True}, status=502)
        with db: db.execute('UPDATE submissions SET status=? WHERE key=?', ('done', key))
    return web.json_response({'success': True, 'applied': done})


def setup(app):
    db = app['db']
    db.execute('CREATE TABLE IF NOT EXISTS meal_catalog (key TEXT PRIMARY KEY, data TEXT, updated TEXT)')
    db.execute('CREATE TABLE IF NOT EXISTS meal_aliases (id TEXT PRIMARY KEY, recipe_key TEXT)')
    db.execute('CREATE TABLE IF NOT EXISTS meal_feedback (key TEXT PRIMARY KEY, rating TEXT, skip_date TEXT, revision INTEGER)')
    db.execute('CREATE TABLE IF NOT EXISTS meal_cooked (key TEXT, day TEXT, PRIMARY KEY(key, day))')
    db.execute('CREATE TABLE IF NOT EXISTS meal_preferences (id INTEGER PRIMARY KEY, data TEXT, revision INTEGER)')
    db.execute('CREATE TABLE IF NOT EXISTS meal_drafts (id TEXT PRIMARY KEY, data TEXT, created TEXT)')
    db.commit()
    app.router.add_get('/api/meal-experience', get_state)
    app.router.add_get('/api/meal-experience/feedback', get_feedback)
    app.router.add_post('/api/meal-experience/actions', actions)
    app.router.add_get('/api/meal-experience/draft', draft)
    app.router.add_post('/api/meal-experience/apply', apply_draft)
