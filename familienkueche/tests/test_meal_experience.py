import asyncio
import io
import json
import tempfile
import unittest
from pathlib import Path
from datetime import date, datetime, timedelta
from unittest.mock import AsyncMock, patch

from aiohttp import web
from aiohttp.test_utils import make_mocked_request
from PIL import Image
from server import make_app, TZ
from meal_images import original_image, thumbnail, decorate as image_decorate, image
from meal_experience import actions, context, feedback, remember, settings, decorate, draft, apply_draft, today, choose_plan
from meal_ai import status, varied_recipes


URL = 'https://www.chefkoch.de/rezepte/3292071488802922/Hack-Brokkoli-Pfanne.html'
CDN = 'https://img.chefkoch-cdn.de/rezepte/3292071488802922/bilder/1108452/crop-960x540/gericht.jpg'


def jpeg():
    output = io.BytesIO(); Image.new('RGB', (1200, 800), '#d1a971').save(output, 'JPEG'); return output.getvalue()


class ImageTests(unittest.TestCase):
    def test_original_metadata_and_strict_recipe_cdn_pair(self):
        self.assertEqual(original_image('<meta property="og:image" content="'+CDN+'">', URL), CDN)
        ld = {'@graph': [{'@type': 'Recipe', 'image': [{'url': CDN}]}]}
        self.assertEqual(original_image('<script type="application/ld+json">'+json.dumps(ld)+'</script>', URL), CDN)
        for bad in ['http://127.0.0.1/image.jpg', 'https://img.chefkoch-cdn.de.evil/rezepte/3292071488802922/bilder/a.jpg',
                    CDN.replace('/3292071488802922/', '/99999/'), CDN+'?target=http://127.0.0.1']:
            self.assertIsNone(original_image('<meta property="og:image" content="'+bad+'">', URL))

    def test_thumbnail_dimensions_and_invalid_bytes(self):
        result = thumbnail(jpeg())
        with Image.open(io.BytesIO(result)) as image:
            self.assertEqual(image.format, 'JPEG'); self.assertLessEqual(image.width, 800); self.assertLessEqual(image.height, 500)
        with self.assertRaises(Exception): thumbnail(b'<svg><script>bad</script></svg>')


class ExperienceTests(unittest.IsolatedAsyncioTestCase):
    async def test_mealie_rating_survives_discovered_original_url(self):
        recipe={'id':'b1234567-1234-4234-9234-123456789abc','name':'Familienpasta','favorite':True}
        remember(self.app,[recipe]); old=recipe['recipeKey']
        await actions(self.request(dict(action='rate',recipeKey=old,rating='like',revision=0)))
        await actions(self.request(dict(action='cooked',recipeKey=old,done=True,revision=1),'cooked-alias-1234567890123456'))
        remember(self.app,[{**recipe,'sourceUrl':URL}])
        current=feedback(self.app,'u:'+URL)
        self.assertEqual(current['rating'],'like');self.assertEqual(current['lastCooked'],today())
        self.assertIsNone(self.app['db'].execute('SELECT 1 FROM meal_catalog WHERE key=?',(old,)).fetchone())
        later={'id':recipe['id'],'name':'Familienpasta','sourceUrl':None}
        remember(self.app,[later])
        self.assertEqual(later['recipeKey'],'u:'+URL)
        self.assertEqual(feedback(self.app,later['recipeKey'])['rating'],'like')
    async def test_rejected_recipe_uses_stored_alternative_without_paid_call(self):
        from meal_ai import present_result
        titles = ['Hähnchen-Pasta','Linsen-Eintopf','Pizza','Brokkoli-Pasta','Gurkensalat','Lachs gebraten','Paprika-Reis','Tofu-Curry','Kartoffelpfanne']
        rows = [dict(url=f'https://www.chefkoch.de/rezepte/{900+i}/Rezept.html',title=title,matches=[],ingredients=[],minutes=25) for i,title in enumerate(titles)]
        raw = dict(recipes=rows[:8],alternatives=rows[8:],mode='mixed')
        initial = present_result(self.app,raw)
        key = next(r['recipeKey'] for r in initial['recipes'] if r['title']=='Hähnchen-Pasta')
        await actions(self.request(dict(action='rate',recipeKey=key,rating='dislike',revision=0)))
        result = present_result(self.app,raw)
        self.assertEqual(len(result['recipes']),8)
        self.assertNotIn('Hähnchen-Pasta',[r['title'] for r in result['recipes']])
        self.assertIn('Kartoffelpfanne',[r['title'] for r in result['recipes']])
        self.ha.service.assert_not_called()

    async def asyncSetUp(self):
        self.ha = AsyncMock(); self.app = make_app(self.ha, ':memory:')
        self.app['meal_image_fetch'] = AsyncMock(return_value=thumbnail(jpeg()))
        self.recipe = {'url': URL, 'title': 'Hähnchen-Pasta', 'minutes': 25, 'matches': ['Hähnchen'], 'ingredients': []}
        remember(self.app, [self.recipe])

    async def asyncTearDown(self):
        self.app['db'].close()
        if hasattr(self, 'tmp'): self.tmp.cleanup()

    def request(self, body=None, key='experience-1234567890123456', path='/api/meal-experience/actions', match_info=None):
        req = make_mocked_request('POST' if body else 'GET', path, app=self.app,
                                  headers={'Idempotency-Key': key}, match_info=match_info or {})
        req.json = AsyncMock(return_value=body); return req

    async def test_photos_cache_unknown_hash_failure_and_restart_data(self):
        result = image_decorate(self.app, {'recipes': [self.recipe]})
        ident = result['recipes'][0]['image'].split('/')[-1][:-4]
        req = self.request(match_info={'ident': ident})
        first, second = await asyncio.gather(image(req), image(req))
        self.assertEqual(first.content_type, 'image/jpeg'); self.assertEqual(first.body, second.body)
        self.app['meal_image_fetch'].assert_awaited_once_with(URL)
        self.app['meal_image_fetch'].side_effect = RuntimeError('private token must not leak')
        self.app['db'].execute('UPDATE meal_images SET updated=0')
        self.assertEqual((await image(req)).body, first.body)
        with self.assertRaises(web.HTTPNotFound): await image(self.request(match_info={'ident': 'f'*64}))
        self.assertEqual(self.app['meal_image_fetch'].await_count, 2)
        self.ha.service.assert_not_called()

    async def test_negative_photo_cache_and_bounded_registered_urls(self):
        self.app['meal_image_fetch'].side_effect = ValueError('No picture')
        result = image_decorate(self.app, {'recipes': [self.recipe]})
        ident = result['recipes'][0]['image'].split('/')[-1][:-4]
        for _ in range(2):
            with self.assertRaises(web.HTTPNotFound): await image(self.request(match_info={'ident': ident}))
        self.app['meal_image_fetch'].assert_awaited_once()
        invalid = image_decorate(self.app, {'recipes': [{'url': 'http://127.0.0.1/secret'}]})
        self.assertNotIn('image', invalid['recipes'][0])

    async def test_like_skip_dislike_and_revision_receipts(self):
        key = self.recipe['recipeKey']
        body = dict(action='rate', recipeKey=key, rating='like', revision=0)
        self.assertEqual((await actions(self.request(body))).status, 200)
        self.assertEqual((await actions(self.request(body))).status, 200)
        self.assertEqual(feedback(self.app, key)['revision'], 1)
        self.assertIn('Hähnchen-Pasta', context(self.app)['liked'])
        skip = await actions(self.request({**body, 'rating': 'skip', 'revision': 1}, 'skip-1234567890123456'))
        self.assertEqual(skip.status, 200)
        self.assertEqual(decorate(self.app, {'recipes': [self.recipe]})['recipes'], [])
        tomorrow = (date.fromisoformat(today())+timedelta(days=1)).isoformat()
        with patch('meal_experience.today', return_value=tomorrow):
            self.assertFalse(feedback(self.app, key)['skipped'])
            self.assertEqual(len(decorate(self.app, {'recipes': [self.recipe]})['recipes']), 1)
        conflict = await actions(self.request({**body, 'rating': 'dislike'}, 'conflict-1234567890123456'))
        self.assertEqual(conflict.status, 409)
        bad = await actions(self.request({**body, 'recipeKey': 'u:https://evil/anything'}, 'bad-1234567890123456'))
        self.assertEqual(bad.status, 400); self.ha.service.assert_not_called()

    async def test_cooked_history_is_actual_not_planned_and_undo(self):
        key = self.recipe['recipeKey']; body = dict(action='cooked', recipeKey=key, done=True, revision=0)
        self.assertIsNone(feedback(self.app, key)['lastCooked'])
        await actions(self.request(body))
        self.assertEqual(feedback(self.app, key)['lastCooked'], today())
        self.assertIn('Hähnchen-Pasta', context(self.app)['recentlyCooked'])
        await actions(self.request({**body, 'done': False, 'revision': 1}, 'undo-1234567890123456'))
        self.assertIsNone(feedback(self.app, key)['lastCooked'])
        self.ha.service.assert_not_called()

    async def test_edit_profile_and_learning_context_are_local(self):
        body = dict(action='profile', preferred='Pizza, Reis', avoid='Nüsse, Sellerie', revision=0)
        out = await actions(self.request(body))
        self.assertEqual(out.status, 200)
        self.assertEqual(settings(self.app)[0]['avoid'], ['Nüsse', 'Sellerie'])
        conflict = await actions(self.request(body, 'profile-1234567890123456'))
        self.assertEqual(conflict.status, 409)
        self.assertEqual(status(self.app)['profile']['preferred'], ['Pizza', 'Reis'])
        self.ha.service.assert_not_called()

    async def test_preferences_ratings_cooked_and_photo_survive_restart(self):
        self.app['db'].close(); self.tmp = tempfile.TemporaryDirectory()
        path = str(Path(self.tmp.name)/'recipes.sqlite')
        self.app = make_app(self.ha, path)
        remember(self.app, [self.recipe]); key = self.recipe['recipeKey']
        await actions(self.request(dict(action='rate',recipeKey=key,rating='like',revision=0)))
        await actions(self.request(dict(action='cooked',recipeKey=key,done=True,revision=1),'cooked-1234567890123456'))
        await actions(self.request(dict(action='profile',preferred='Pizza, Reis',avoid='Nüsse',revision=0),'taste-1234567890123456'))
        picture = image_decorate(self.app, {'recipes':[self.recipe]})['recipes'][0]['image'].split('/')[-1][:-4]
        self.app['meal_image_fetch'] = AsyncMock(return_value=thumbnail(jpeg()))
        await image(self.request(match_info={'ident':picture}))
        self.app['db'].close(); self.app=make_app(self.ha,path)
        self.app['meal_image_fetch']=AsyncMock(side_effect=RuntimeError('Should be cached'))
        self.assertEqual(settings(self.app)[0]['preferred'],['Pizza','Reis'])
        self.assertEqual(feedback(self.app,key)['rating'],'like')
        self.assertEqual(feedback(self.app,key)['lastCooked'],today())
        self.assertEqual((await image(self.request(match_info={'ident':picture}))).content_type,'image/jpeg')
        self.app['meal_image_fetch'].assert_not_called()

    async def test_favorites_and_feedback_persist_in_catalog_without_overwriting(self):
        from meals import remember as remember_meals
        recipe = dict(id='a1234567-1234-4234-9234-123456789abc', sourceUrl=URL, name='Familienpasta', favorite=True)
        remember_meals(self.app, [recipe])
        image_decorate(self.app, {'recipes': [self.recipe]})
        remember(self.app, [self.recipe])
        self.assertIn('Familienpasta', context(self.app)['favorites'])
        self.assertEqual(self.recipe['recipeKey'], recipe['recipeKey'])

    async def test_familiar_and_discovery_balance(self):
        rows = []
        for i, title in enumerate(['Brokkoli-Pasta', 'Hähnchen-Pfanne', 'Pizza', 'Linsen-Eintopf', 'Gurkensalat', 'Lachs gebraten', 'Paprika-Reis', 'Tofu-Curry']):
            rows.append(dict(url=f'https://www.chefkoch.de/rezepte/{500+i}/Rezept.html', title=title, matches=[], minutes=25))
        chosen = varied_recipes(rows, 'quick', ['Nudeln', 'Pizza', 'Hähnchen', 'Eintöpfe'])
        self.assertEqual(len(chosen), 8)
        from meal_ai import preference_score
        self.assertEqual([bool(preference_score(r, ['Nudeln','Pizza','Hähnchen','Eintöpfe'])) for r in chosen], [True, False]*4)


class PlanTests(unittest.IsolatedAsyncioTestCase):
    async def test_plan_revision_ignores_feedback_presentation(self):
        from meals import get_plan, normalize_plan, revision
        self.plan.append(dict(mealplan_id=1,mealplan_date=today(),entry_type='dinner',recipe=self.raw[0]))
        query='/api/meals?start='+today()+'&end='+(self.day+timedelta(days=1)).isoformat()
        out=await get_plan(make_mocked_request('GET',query,app=self.app))
        value=json.loads(out.text)
        self.assertIn('feedback',value['entries'][0]['recipe'])
        self.assertEqual(value['revisions'][today()],revision(normalize_plan(self.plan)))
        key=value['entries'][0]['recipe']['recipeKey']
        with self.app['db']:self.app['db'].execute('INSERT INTO meal_feedback VALUES (?, ?, ?, ?)',(key,'like','',1))
        updated=await get_plan(make_mocked_request('GET',query,app=self.app))
        self.assertEqual(json.loads(updated.text)['revisions'],value['revisions'])
    async def test_profile_excludes_nut_recipe_and_draft_preserves_occupied_days(self):
        self.raw[0]['ingredients'].append({'food':{'name':'Cashews'},'display':'Cashews'})
        self.plan.append(dict(mealplan_id=1,mealplan_date=today(),entry_type='dinner',recipe=self.raw[3]))
        data, body = await self.prepare()
        self.assertNotIn(today(), [x['date'] for x in data['entries']])
        self.assertNotIn(self.raw[0]['recipe_id'], [r['id'] for r in data['pool']])
        self.assertEqual(self.writes, [])
    async def asyncSetUp(self):
        self.ha = AsyncMock(); self.app = make_app(self.ha, ':memory:', {'mealie_entry_id': 'fixture'})
        self.day = date.fromisoformat(today()); self.plan = []; self.writes = []; self.fail_at = None
        self.raw = []
        for i, (name, minutes, foods) in enumerate([
                ('Hähnchen-Pasta', 25, ['Tomaten','Hähnchen']), ('Linsen-Eintopf', 90, ['Tomaten','Linsen']),
                ('Pizza', 60, ['Tomaten','Mehl']), ('Gurkensalat', 20, ['Gurke','Sahne'])]):
            self.raw.append(dict(recipe_id=f'a1234567-1234-4234-9234-{i:012d}', name=name, total_time=f'PT{minutes}M',
                                 tags=[{'name':'Familienfavorit'}], ingredients=[{'food':{'name':f}, 'display':f} for f in foods], instructions=[]))
        async def service(domain, name, data, **kwargs):
            if name == 'get_recipes': return {'recipes': {'items': self.raw}}
            if name == 'get_recipe': return {'recipe': next(r for r in self.raw if r['recipe_id'] == data['recipe_id'])}
            if name == 'get_mealplan': return {'mealplan': self.plan}
            if name == 'set_mealplan':
                self.writes.append(data)
                self.plan.append(dict(mealplan_id=len(self.plan)+1, mealplan_date=data['date'], entry_type='dinner', recipe=next(r for r in self.raw if r['recipe_id']==data['recipe_id'])))
                if len(self.writes) == self.fail_at: raise TimeoutError('Ambiguous write')
                return {}
            raise RuntimeError(name)
        self.ha.service.side_effect = service
        begin = datetime.combine(self.day, datetime.min.time(), TZ).replace(hour=16)
        self.ha.events.return_value = [dict(start={'dateTime':begin.isoformat()},end={'dateTime':(begin+timedelta(hours=2)).isoformat()})]

    async def asyncTearDown(self): self.app['db'].close()

    def req(self, body=None, key='draft-1234567890123456'):
        r = make_mocked_request('POST' if body else 'GET', '/api/meal-experience/draft?start='+today(), app=self.app, headers={'Idempotency-Key':key})
        r.json = AsyncMock(return_value=body); return r

    async def prepare(self):
        out = await draft(self.req()); self.assertEqual(out.status, 200)
        data = json.loads(out.text)
        return data, dict(id=data['id'],confirm=True,entries=[dict(date=x['date'],recipeId=x['recipe']['id']) for x in data['entries']])

    async def test_review_draft_busy_day_shared_ingredients_and_confirm_once(self):
        data, body = await self.prepare()
        self.assertEqual(self.writes, [])
        self.assertEqual(len(data['entries']),3)
        self.assertTrue(data['entries'][0]['busy']); self.assertLessEqual(data['entries'][0]['recipe']['minutes'],30)
        self.assertTrue(any(e['shared'] for e in data['entries'][1:]))
        out = await apply_draft(self.req(body)); self.assertEqual(out.status,200)
        self.assertEqual(len(self.writes),3)
        again = await apply_draft(self.req(body)); self.assertEqual(again.status,200); self.assertEqual(len(self.writes),3)

    async def test_new_occupied_day_blocks_all_writes(self):
        data, body = await self.prepare()
        self.plan.append(dict(mealplan_id=1,mealplan_date=data['entries'][0]['date'],entry_type='dinner',recipe=self.raw[0]))
        out = await apply_draft(self.req(body)); self.assertEqual(out.status,409); self.assertEqual(self.writes,[])

    async def test_partial_failure_never_retries(self):
        data, body = await self.prepare(); self.fail_at=2
        out = await apply_draft(self.req(body)); self.assertEqual(out.status,502)
        self.assertEqual(len(json.loads(out.text)['applied']),1)
        self.assertEqual(len(self.writes),2)
        again = await apply_draft(self.req(body)); self.assertEqual(again.status,409); self.assertEqual(len(self.writes),2)
        fresh_key = await apply_draft(self.req(body,'new-client-1234567890123456'))
        self.assertEqual(fresh_key.status,409); self.assertEqual(len(self.writes),2)

    async def test_changed_profile_requires_new_review(self):
        data, body = await self.prepare()
        with self.app['db']: self.app['db'].execute('INSERT INTO meal_preferences VALUES (1, ?, 1)',(json.dumps({'preferred':['Pizza'],'avoid':['Nüsse']}),))
        out = await apply_draft(self.req(body)); self.assertEqual(out.status,409); self.assertEqual(self.writes,[])


if __name__ == '__main__': unittest.main()
