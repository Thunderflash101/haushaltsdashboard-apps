"""Public defaults and private installation values must remain separate."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock
from aiohttp import web
from aiohttp.test_utils import make_mocked_request
import yaml
from server import make_app
from profiles import snapshot
from meal_ai import taste_profile
from meals import get_image


class NeutralConfigTests(unittest.IsolatedAsyncioTestCase):
    async def test_neutral_defaults_allow_missing_media_base(self):
        options=yaml.safe_load((Path(__file__).parents[1]/'config.yaml').read_text())['options']
        app=make_app(AsyncMock(),':memory:',options=options)
        try:
            self.assertEqual([app['profile_names'][p] for p in ('tina','joern','felix')],['Person 1','Person 2','Person 3'])
            self.assertEqual(app['mealie_image_base'],'')
            self.assertEqual(taste_profile(options),{'preferred':[],'avoid':[]})
            rid='12345678-1234-4234-9234-123456789012';app['recipe_ids'].add(rid)
            req=make_mocked_request('GET','/api/recipes/'+rid+'/image',app=app,match_info={'recipe_id':rid})
            with self.assertRaises(web.HTTPNotFound):await get_image(req)
            app['ha'].session.get.assert_not_called()
        finally:app['db'].close()

    async def test_saved_installation_options_and_profile_rows_survive(self):
        options={'profile_name_1':'Alex & <A>','profile_name_2':'Sam','profile_name_3':'Kim',
                 'tina_calendar':'calendar.private_one','joern_calendar':'calendar.private_two',
                 'birthdays_calendar':'calendar.private_birthdays','shopping_entity':'todo.private_items',
                 'mealie_image_base_url':'http://meals.example.test:9001',
                 'meal_ai_preferred_dishes':'Reis','meal_ai_avoid':'Sellerie'}
        with tempfile.TemporaryDirectory() as root:
            db=str(Path(root)/'app.sqlite');app=make_app(AsyncMock(),db,options=options)
            with app['db']:
                app['db'].execute("UPDATE family_profiles SET color='#123456',revision=7,image=?,digest='test' WHERE person='tina'",(b'private-test-photo',))
            before=snapshot(app);app['db'].close()
            app=make_app(AsyncMock(),db,options=options)
            try:
                self.assertEqual(snapshot(app),before)
                self.assertEqual(app['profile_names']['tina'],'Alex & <A>')
                self.assertEqual(app['sources'][0]['entity'],'calendar.private_one')
                self.assertEqual(app['sources'][0]['label'],'Alex & <A> · Kalender')
                self.assertEqual(app['sources'][3]['entity'],'calendar.private_birthdays')
                self.assertEqual(app['mealie_image_base'],'http://meals.example.test:9001')
                self.assertEqual(taste_profile(options),{'preferred':['Reis'],'avoid':['Sellerie']})
                self.assertEqual(app['db'].execute("SELECT image FROM family_profiles WHERE person='tina'").fetchone()[0],b'private-test-photo')
            finally:app['db'].close()

    async def test_invalid_names_and_configured_media_url_are_rejected(self):
        for options in [{'profile_name_1':''},{'profile_name_1':'x'*41},{'profile_name_2':'A\nB'}, {'mealie_image_base_url':'http://user:password@example.test'}]:
            with self.assertRaises(ValueError):make_app(AsyncMock(),':memory:',options=options)
