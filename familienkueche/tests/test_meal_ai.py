import asyncio
import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch

from aiohttp.test_utils import make_mocked_request
from meal_ai import DEFAULT_PROFILE, get_offers, get_status, ingredient_offers, payload, read_key, recipe_url, result_from_response, taste_profile, trial, validate, varied_recipes
from server import TZ, make_app

URL = 'https://www.chefkoch.de/rezepte/123456789/Brokkoli-Pasta.html'
FAKE_KEY = 'sk-not-a-real-credential-test-only'


def data():
    today = datetime.now(TZ).date()
    return dict(confirm=True, shop='Aldi Nord', start=today.isoformat(), end=(today+timedelta(days=6)).isoformat(),
                offers='Brokkoli 500 g 0,99 Euro', vegetarian=True)


def response():
    content = dict(offers=['Brokkoli · 500 g · 0,99 €'], warnings=[],
                   recipes=[dict(title='Brokkoli-Pasta', url=URL, minutes=25, reason='Mit Angebotsgemüse', matches=['Brokkoli'])])
    return dict(status='completed', usage={'input_tokens': 1200, 'output_tokens': 500}, output=[
        {'type': 'web_search_call', 'action': {'sources': [{'url': URL}]}},
        {'type': 'message', 'content': [{'type': 'output_text', 'text': json.dumps(content)}]}])


class MealAIValidation(unittest.TestCase):
    def test_modes_total_time_and_known_active_work(self):
        raw = response()
        rows = [dict(title=title, url=f'https://www.chefkoch.de/rezepte/{100+i}/Rezept.html',
                     minutes=minutes, activeMinutes=active, reason='Passend', matches=[title], ingredients=[])
                for i, (title, minutes, active) in enumerate([
                    ('Hähnchen-Nudeln', 25, 15), ('Kartoffel-Eintopf', 90, 20),
                    ('Pizza', 150, None), ('Längerer Braten', 181, 15), ('Gemüsesuppe', 60, 90)])]
        raw['output'][0]['action']['sources'] = [{'url': r['url']} for r in rows]
        raw['output'][1]['content'][0]['text'] = json.dumps(dict(offers=['Kartoffeln'], recipes=rows, warnings=[]))
        quick = result_from_response(raw, {**data(), 'mode': 'quick'})
        self.assertEqual([r['minutes'] for r in quick['recipes']], [25])
        self.assertEqual(quick['recipes'][0]['activeMinutes'], 15)
        weekend = result_from_response(raw, {**data(), 'mode': 'weekend'})
        self.assertEqual(len(weekend['recipes']), 4)
        self.assertTrue(any(r['minutes'] == 150 for r in weekend['recipes']))
        self.assertFalse(any(r['minutes'] > 180 for r in weekend['recipes']))
        self.assertIsNone(next(r for r in weekend['recipes'] if r['title'] == 'Gemüsesuppe')['activeMinutes'])
        self.assertEqual(weekend['mode'], 'weekend')
        self.assertEqual(validate(data())['mode'], 'mixed')
        with self.assertRaises(ValueError): validate({**data(), 'mode': 'unknown'})

    def test_taste_profile_and_hidden_nut_ingredients(self):
        self.assertEqual(taste_profile({}), DEFAULT_PROFILE)
        self.assertEqual(taste_profile({'meal_ai_preferred_dishes': 'Pizza, Pizza', 'meal_ai_avoid': ''}),
                         {'preferred': ['Pizza'], 'avoid': []})
        raw = response()
        names = ['Hähnchen-Curry', 'Nudeln mit Pesto', 'Pizza mit Gemüse', 'Hähnchen-Pfanne']
        ingredients = [['Cashewmus'], ['Basilikum', 'Pinienkerne'], ['Tomaten', 'Käse'], ['Hähnchen', 'Paprika']]
        rows = [dict(title=title, url=f'https://www.chefkoch.de/rezepte/{200+i}/Rezept.html', minutes=25,
                     reason='Passend', matches=['Gemüse'], ingredients=ingredients[i]) for i, title in enumerate(names)]
        raw['output'][0]['action']['sources'] = [{'url': r['url']} for r in rows]
        raw['output'][1]['content'][0]['text'] = json.dumps(dict(offers=['Gemüse'], recipes=rows, warnings=[]))
        result = result_from_response(raw, data())
        self.assertEqual({r['title'] for r in result['recipes']}, {'Pizza mit Gemüse', 'Hähnchen-Pfanne'})
        self.assertEqual(result['profile'], DEFAULT_PROFILE)

    def test_mixed_balances_short_and_long_favorite_dishes(self):
        titles = ['Brokkoli-Pasta', 'Hähnchen-Pfanne', 'Tomaten-Nudeln', 'Lachs-Spaghetti',
                  'Kartoffel-Eintopf', 'Pizza mit Paprika', 'Möhren-Eintopf', 'Hähnchen aus dem Ofen']
        rows = [dict(title=title, url=f'https://www.chefkoch.de/rezepte/{300+i}/Rezept.html',
                     minutes=25 if i < 4 else 90, matches=[title], reason='Passend') for i, title in enumerate(titles)]
        result = varied_recipes(rows, 'mixed', DEFAULT_PROFILE['preferred'])
        self.assertEqual(len(result), 8)
        self.assertEqual([r['minutes'] <= 30 for r in result], [True, False]*4)
        other = dict(title='Gurkensalat', url='https://www.chefkoch.de/rezepte/400/Rezept.html',
                     minutes=15, matches=['Gurke'], reason='Passend')
        self.assertNotEqual(varied_recipes([other, rows[0]], 'quick', DEFAULT_PROFILE['preferred'])[0], other)

    def test_reported_cream_variants_and_duplicate_recipe_ids(self):
        def dish(title, ident, matches):
            return dict(title=title, url=f'https://www.chefkoch.de/rezepte/{ident}/Rezept.html',
                        minutes=30, reason='Test', matches=matches)
        rows = [dish('Sahne-Rosenkohl', 100, ['Rosenkohl']),
                dish('Rosenkohl in cremiger Soße', 101, ['Rosenkohl']),
                dish('Rosenkohlgratin', 102, ['Rosenkohl']),
                dish('Rosenkohlsalat', 103, ['Rosenkohl']),
                dish('Brokkoli-Pasta', 104, ['Brokkoli']),
                dish('Hähnchen-Curry', 105, ['Hähnchen'])]
        rows.append({**rows[4], 'url': 'https://www.chefkoch.de/rezepte/104/Anderer-Titel.html'})
        selected = varied_recipes(rows)
        titles = [r['title'] for r in selected]
        self.assertIn('Sahne-Rosenkohl', titles)
        self.assertNotIn('Rosenkohl in cremiger Soße', titles)
        self.assertEqual(sum('Rosenkohl' in t for t in titles), 2)
        self.assertEqual(sum(t == 'Brokkoli-Pasta' for t in titles), 1)
        self.assertIn('Hähnchen-Curry', titles)

    def test_eight_varied_recipes_from_larger_sourced_pool(self):
        titles = ['Rosenkohl in Sahnesauce', 'Rosenkohl in cremiger Soße', 'Brokkoli-Pasta',
                  'Kartoffelpfanne', 'Hähnchen-Curry', 'Lachssalat', 'Möhrensuppe',
                  'Linsen-Eintopf', 'Zucchini-Gratin', 'Paprika mit Reis', 'Tofu gebraten', 'Spinat-Pasta']
        raw = response()
        rows = [dict(title=title, url=f'https://www.chefkoch.de/rezepte/{i+10000}/Rezept.html',
                     minutes=25, reason='Passend', matches=[title]) for i, title in enumerate(titles)]
        raw['output'][0]['action']['sources'] = [{'url': r['url']} for r in rows]
        raw['output'][1]['content'][0]['text'] = json.dumps(dict(offers=['Gemüse'], warnings=[], recipes=rows))
        result = result_from_response(raw, data())
        self.assertEqual(result['targetCount'], 8)
        self.assertEqual(len(result['recipes']), 8)
        self.assertFalse(any(r['title'] == 'Rosenkohl in cremiger Soße' for r in result['recipes']))
        self.assertEqual(len({r['url'] for r in result['recipes']}), 8)

    def test_real_recipe_tracking_unicode_and_visited_pages(self):
        tracked = URL+'?utm_source=search#zutaten'
        self.assertEqual(recipe_url(tracked), URL)
        self.assertEqual(recipe_url(URL.replace('https:', 'http:')), URL)
        self.assertEqual(recipe_url('https://chefkoch.de/rezepte/123/Käse.html'),
                         'https://www.chefkoch.de/rezepte/123/K%C3%A4se.html')
        for bad in ['https://chefkoch.de.evil/rezepte/123/Pasta.html', 'https://user@chefkoch.de/rezepte/123/Pasta.html',
                    'https://www.chefkoch.de/rs/s0/brokkoli/Rezepte.html', 'https://www.chefkoch.de/rezepte/123/%2Fprivate.html']:
            self.assertIsNone(recipe_url(bad))
        raw = response()
        content = json.loads(raw['output'][1]['content'][0]['text'])
        content['recipes'][0]['url'] = tracked
        raw['output'][1]['content'][0]['text'] = json.dumps(content)
        raw['output'][0]['action'] = {'type': 'open_page', 'url': URL+'?ref=search'}
        result = result_from_response(raw, data())
        self.assertEqual(result['recipes'][0]['url'], URL)
        raw['output'][0]['action'] = {'type': 'search', 'sources': [{'url': URL+'?ref=search'}]}
        self.assertEqual(result_from_response(raw, data())['recipes'][0]['url'], URL)

    def test_aldi_names_filter_and_unreliable_prices_not_forwarded(self):
        raw = {'state': '10', 'attributes': {'valid_until': '14.11.', 'discounts': [
            {'product': '', 'price': '9.11', 'category': 'Manual'},
            {'product': '1,5%', 'price': '2.99'},
            {'product': 'Speisemöhren', 'price': '1.69', 'base_price': 'WRONG'},
            {'product': 'Rinderhackfleisch XXL', 'price': '0.00'},
            {'product': 'Hähnchentasche', 'price': '0.00'},
            {'product': '  Speisemöhren  ', 'price': '999.00'},
            {'product': 'Hundefutter Hähnchen'}, {'product': 'LED-Weihnachtswichtel'},
            {'product': 'Salatschüssel'}, {'product': 'Unbekannter Artikel'},
        ]}}
        result = ingredient_offers(raw)
        self.assertEqual(result['products'], ['Hähnchentasche', 'Rinderhackfleisch XXL', 'Speisemöhren'])
        self.assertEqual(result['total'], 10); self.assertEqual(result['incomplete'], 2)
        self.assertNotIn('1.69', json.dumps(result)); self.assertNotIn('WRONG', json.dumps(result))
        self.assertEqual(result['reportedValidity'], '14.11.')

    def test_aldi_invalid_empty_and_bounded_data(self):
        for raw in [None, {'state': 'unavailable'}, {'state': 'unknown'}, {'state': '0', 'attributes': {}}]:
            with self.assertRaises(ValueError): ingredient_offers(raw)
        self.assertEqual(ingredient_offers({'state': '0', 'attributes': {'discounts': []}})['products'], [])
        many = {'state': '100', 'attributes': {'discounts': [{'product': 'Kartoffeln '+str(i)} for i in range(100)]}}
        result = ingredient_offers(many)
        self.assertEqual(result['count'], 80); self.assertEqual(result['omitted'], 20)

    def test_only_named_secret_and_never_parser_details(self):
        with tempfile.TemporaryDirectory() as root:
            p = Path(root)/'secrets.yaml'
            self.assertEqual(read_key(p), '')
            p.write_text('another_key: PRIVATE\nfamilienkueche_openai_api_key: "'+FAKE_KEY+'"\n')
            self.assertEqual(read_key(p), FAKE_KEY)
            for raw in ['familienkueche_openai_api_key: [PRIVATE', '!!python/object/apply:os.system [false]',
                        'familienkueche_openai_api_key: "sk-inject\\nheader"', 'a'*1_000_001]:
                p.write_text(raw); self.assertEqual(read_key(p), '')

    def test_request_limits_and_current_dates(self):
        self.assertEqual(validate(data())['shop'], 'Aldi Nord')
        for changes in [dict(confirm=False), dict(offers=''), dict(offers='x'*12001), dict(image='old-upload'),
                        dict(vegetarian='true'), dict(end='2020-01-01'), dict(shop='other')]:
            with self.assertRaises(ValueError): validate({**data(), **changes})

    def test_source_grounding_blocks_made_up_urls_and_long_recipes(self):
        raw = response(); content = json.loads(raw['output'][1]['content'][0]['text'])
        content['recipes'] += [dict(content['recipes'][0], url='https://127.0.0.1/secret'),
                               dict(content['recipes'][0], url='https://www.chefkoch.de/rezepte/999999/Invented.html'),
                               dict(content['recipes'][0], minutes=181)]
        raw['output'][1]['content'][0]['text'] = json.dumps(content)
        result = result_from_response(raw, data())
        self.assertEqual(len(result['recipes']), 1)
        self.assertTrue(result['warnings'])
        raw['status'] = 'incomplete'
        with self.assertRaises(ValueError): result_from_response(raw, data())

    def test_bounded_payload_without_personal_context(self):
        body = payload(validate(data()), 'gpt-6-luna')
        self.assertFalse(body['store']); self.assertEqual(body['max_tool_calls'], 6)
        self.assertEqual(body['max_output_tokens'], 8000)
        self.assertEqual(body['tools'][0]['filters']['allowed_domains'], ['chefkoch.de'])
        self.assertNotIn(FAKE_KEY, json.dumps(body)); self.assertNotIn('calendar', json.dumps(body))


class MealAIApi(unittest.IsolatedAsyncioTestCase):
    async def test_mode_specific_cache_and_server_profile(self):
        first = await trial(self.request({**data(), 'mode': 'quick', 'profile': {'preferred': [], 'avoid': []}}))
        self.assertEqual(first.status, 200)
        sent = self.app['meal_ai_call'].call_args.args[1]
        user_data = json.loads(sent['input'][0]['content'][0]['text'])
        self.assertEqual(user_data['profile'], DEFAULT_PROFILE)
        second = await trial(self.request({**data(), 'mode': 'weekend'}, 'ai-weekend-1234567890123456'))
        self.assertEqual(second.status, 200); self.assertFalse(json.loads(second.text)['cached'])
        self.assertEqual(self.app['meal_ai_call'].await_count, 2)
        again = await trial(self.request({**data(), 'mode': 'quick'}, 'ai-quick-1234567890123456'))
        self.assertTrue(json.loads(again.text)['cached'])
        self.assertEqual(self.app['meal_ai_call'].await_count, 2)

    async def test_names_only_and_legacy_empty_cache_can_be_researched(self):
        body = {**data(), 'offers': 'Brokkoli\nRinderhackfleisch', 'vegetarian': False}
        legacy_digest = hashlib.sha256(json.dumps([validate(body), self.app['meal_ai_model']], sort_keys=True).encode()).hexdigest()
        self.app['db'].execute('INSERT INTO meal_ai_runs VALUES (?, ?, ?, ?, ?, ?, ?)',
             ('ai-legacy-1234567890123456', legacy_digest, datetime.now(TZ).strftime('%Y-%m'), 'done',
              datetime.now(TZ).isoformat(), json.dumps({'recipes': [], 'offers': [], 'warnings': []}), '{}'))
        self.app['db'].commit()
        out = await trial(self.request(body))
        self.assertEqual(out.status, 200)
        result = json.loads(out.text)
        self.assertFalse(result['cached']); self.assertEqual(len(result['result']['recipes']), 1)
        sent = self.app['meal_ai_call'].call_args.args[1]
        self.assertEqual(sent['tool_choice'], 'required')
        self.assertEqual(sent['tools'][0]['search_context_size'], 'medium')
        self.assertEqual(json.loads(sent['input'][0]['content'][0]['text'])['offers'], body['offers'])
        repeated = await trial(self.request(body, 'ai-new-key-1234567890123456'))
        self.assertTrue(json.loads(repeated.text)['cached'])
        self.app['meal_ai_call'].assert_awaited_once()

    async def test_offer_lookup_only_reads_ha_and_never_calls_ai(self):
        self.app['ha'].request.return_value = {'state': '3', 'attributes': {'discounts': [
            {'product': 'Lachs', 'price': '0.00'}, {'product': 'Tomaten'}, {'product': 'Batterien'}]}}
        result = await get_offers(make_mocked_request('GET', '/api/meal-ai/offers?window=next', app=self.app))
        self.assertEqual(result.status, 200)
        self.assertEqual(json.loads(result.text)['products'], ['Lachs', 'Tomaten'])
        self.app['ha'].request.assert_awaited_once_with('GET', 'states/sensor.aldi_nord_offers_next')
        self.app['meal_ai_call'].assert_not_called(); self.app['ha'].service.assert_not_called()
        self.assertEqual(json.loads((await get_status(self.request())).text)['reservedCents'], 0)

    async def test_offer_failure_and_invalid_window_do_not_charge(self):
        self.app['ha'].request.side_effect = RuntimeError('PRIVATE')
        failed = await get_offers(make_mocked_request('GET', '/api/meal-ai/offers', app=self.app))
        self.assertEqual(failed.status, 502); self.assertNotIn('PRIVATE', failed.text)
        invalid = await get_offers(make_mocked_request('GET', '/api/meal-ai/offers?window=bad', app=self.app))
        self.assertEqual(invalid.status, 400)
        self.app['ha'].request.assert_awaited_once()
        self.app['meal_ai_call'].assert_not_called()

    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name)/'test.sqlite')
        self.app = self.new_app()

    def new_app(self):
        with patch('meal_ai.read_key', return_value=FAKE_KEY):
            app = make_app(AsyncMock(), self.db_path, {'meal_ai_enabled': True, 'meal_ai_monthly_budget_usd': 1})
        app['meal_ai_call'] = AsyncMock(return_value=response())
        return app

    async def asyncTearDown(self):
        self.app['db'].close(); self.tmp.cleanup()

    def request(self, body=None, key='ai-12345678901234567890'):
        req = make_mocked_request('POST', '/api/meal-ai/trial', app=self.app, headers={'Idempotency-Key': key})
        req.json = AsyncMock(return_value=data() if body is None else body)
        return req

    async def test_status_never_calls_provider_and_disabled_never_reads_secret(self):
        out = await get_status(self.request())
        self.assertNotIn(FAKE_KEY, out.text); self.assertTrue(json.loads(out.text)['configured'])
        self.app['meal_ai_call'].assert_not_called()
        self.app['meal_ai_enabled'] = False
        self.assertEqual((await trial(self.request())).status, 409)
        with patch('meal_ai.read_key') as reader:
            app = make_app(AsyncMock(), ':memory:'); reader.assert_not_called(); app['db'].close()

    async def test_success_cache_restart_and_no_ha_writes(self):
        first = await trial(self.request()); self.assertEqual(first.status, 200)
        result = json.loads(first.text)
        self.assertEqual(result['reservedCents'], 25); self.assertEqual(result['usage']['search_calls'], 1)
        self.assertNotIn(FAKE_KEY, first.text)
        self.assertEqual((await trial(self.request())).status, 200)
        cached = await trial(self.request(key='ai-second-12345678901234567890'))
        self.assertTrue(json.loads(cached.text)['cached'])
        self.app['meal_ai_call'].assert_awaited_once(); self.app['ha'].service.assert_not_called()
        self.app['db'].close(); self.app = self.new_app()
        self.assertEqual(json.loads((await get_status(self.request())).text)['result']['recipes'][0]['url'], URL)
        self.assertEqual((await trial(self.request())).status, 200)
        self.app['meal_ai_call'].assert_not_called()

    async def test_ambiguous_failure_keeps_reservation_and_redacts_error(self):
        self.app['meal_ai_call'].side_effect = RuntimeError('PRIVATE '+FAKE_KEY)
        failed = await trial(self.request()); self.assertEqual(failed.status, 502)
        self.assertNotIn(FAKE_KEY, failed.text); self.assertNotIn('PRIVATE', failed.text)
        self.assertEqual((await trial(self.request())).status, 409)
        self.assertEqual(json.loads((await get_status(self.request())).text)['reservedCents'], 25)
        self.app['meal_ai_call'].assert_awaited_once()

    async def test_budget_and_changed_key(self):
        for i in range(4):
            out = await trial(self.request({**data(), 'offers': 'Brokkoli Angebot '+str(i)}, 'ai-trial-1234567890123456-'+str(i)))
            self.assertEqual(out.status, 200)
        denied = await trial(self.request({**data(), 'offers': 'Neues Angebot Tomaten'}, 'ai-trial-1234567890123456-4'))
        self.assertEqual(denied.status, 429); self.assertEqual(self.app['meal_ai_call'].await_count, 4)
        conflict = await trial(self.request(data(), 'ai-trial-1234567890123456-0'))
        self.assertEqual(conflict.status, 409)

    async def test_parallel_requests_only_start_one_paid_call(self):
        gate = asyncio.Event()
        async def call(*args):
            await gate.wait(); return response()
        self.app['meal_ai_call'].side_effect = call
        task = asyncio.create_task(trial(self.request()))
        await asyncio.sleep(.02)
        second = await trial(self.request({**data(), 'offers': 'Andere Angebote Tomaten'}, 'ai-parallel-1234567890123456'))
        self.assertEqual(second.status, 409)
        gate.set(); self.assertEqual((await task).status, 200)
        self.app['meal_ai_call'].assert_awaited_once()

    async def test_removed_upload_is_refused_without_provider_or_cost(self):
        bad = await trial(self.request({**data(), 'image': 'old-image'}))
        self.assertEqual(bad.status, 400); self.app['meal_ai_call'].assert_not_called()
        self.assertEqual(json.loads((await get_status(self.request())).text)['reservedCents'], 0)
        good = await trial(self.request(data()))
        self.assertEqual(good.status, 200)
        body = self.app['meal_ai_call'].call_args.args[1]
        self.assertEqual([c['type'] for c in body['input'][0]['content']], ['input_text'])
        self.assertNotIn('image', json.loads(body['input'][0]['content'][0]['text']))


if __name__ == '__main__': unittest.main()
