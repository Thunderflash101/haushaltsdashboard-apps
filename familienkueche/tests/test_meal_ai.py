import asyncio
import base64
import io
import json
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch

from aiohttp.test_utils import make_mocked_request
from PIL import Image
from meal_ai import get_offers, get_status, ingredient_offers, payload, read_key, result_from_response, trial, validate
from server import TZ, make_app

URL = 'https://www.chefkoch.de/rezepte/123456789/Brokkoli-Pasta.html'
FAKE_KEY = 'sk-not-a-real-credential-test-only'


def data():
    today = datetime.now(TZ).date()
    return dict(confirm=True, shop='Aldi Nord', start=today.isoformat(), end=(today+timedelta(days=6)).isoformat(),
                offers='Brokkoli 500 g 0,99 Euro', image='', vegetarian=True)


def response():
    content = dict(offers=['Brokkoli · 500 g · 0,99 €'], warnings=[],
                   recipes=[dict(title='Brokkoli-Pasta', url=URL, minutes=25, reason='Mit Angebotsgemüse', matches=['Brokkoli'])])
    return dict(status='completed', usage={'input_tokens': 1200, 'output_tokens': 500}, output=[
        {'type': 'web_search_call', 'action': {'sources': [{'url': URL}]}},
        {'type': 'message', 'content': [{'type': 'output_text', 'text': json.dumps(content)}]}])


class MealAIValidation(unittest.TestCase):
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
        for changes in [dict(confirm=False), dict(offers=''), dict(offers='x'*12001), dict(image='x'*2700001),
                        dict(vegetarian='true'), dict(end='2020-01-01'), dict(shop='other')]:
            with self.assertRaises(ValueError): validate({**data(), **changes})

    def test_source_grounding_blocks_made_up_urls_and_long_recipes(self):
        raw = response(); content = json.loads(raw['output'][1]['content'][0]['text'])
        content['recipes'] += [dict(content['recipes'][0], url='https://127.0.0.1/secret'),
                               dict(content['recipes'][0], url='https://www.chefkoch.de/rezepte/999999/Invented.html'),
                               dict(content['recipes'][0], minutes=60)]
        raw['output'][1]['content'][0]['text'] = json.dumps(content)
        result = result_from_response(raw, data())
        self.assertEqual(len(result['recipes']), 1)
        self.assertTrue(result['warnings'])
        raw['status'] = 'incomplete'
        with self.assertRaises(ValueError): result_from_response(raw, data())

    def test_bounded_payload_without_personal_context(self):
        body = payload(validate(data()), 'gpt-6-luna')
        self.assertFalse(body['store']); self.assertEqual(body['max_tool_calls'], 3)
        self.assertEqual(body['max_output_tokens'], 4000)
        self.assertEqual(body['tools'][0]['filters']['allowed_domains'], ['chefkoch.de'])
        self.assertNotIn(FAKE_KEY, json.dumps(body)); self.assertNotIn('calendar', json.dumps(body))


class MealAIApi(unittest.IsolatedAsyncioTestCase):
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

    async def test_image_validation_and_normalization(self):
        bad = await trial(self.request({**data(), 'image': 'not base64!'}))
        self.assertEqual(bad.status, 400); self.app['meal_ai_call'].assert_not_called()
        buf = io.BytesIO(); Image.new('RGB', (20, 20), 'green').save(buf, 'PNG')
        good = await trial(self.request({**data(), 'image': base64.b64encode(buf.getvalue()).decode()}))
        self.assertEqual(good.status, 200)
        body = self.app['meal_ai_call'].call_args.args[1]
        self.assertTrue(body['input'][0]['content'][1]['image_url'].startswith('data:image/jpeg;base64,'))


if __name__ == '__main__': unittest.main()
