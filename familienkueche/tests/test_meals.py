import json
import unittest
from unittest.mock import AsyncMock
from aiohttp.test_utils import make_mocked_request
from aiohttp import web
from server import make_app, HomeAssistant
from meals import chefkoch_url, recipe_details, normalize_plan, revision, meal_write, get_image, get_plan, get_recipes

RID='a1234567-1234-4234-9234-123456789abc'
RAW_RECIPE={'recipe_id':RID,'name':'Pasta <Test>','description':'Lecker','image':'123','total_time':'30 Minuten',
            'ingredients':[{'display':'200 g Pasta'},{'quantity':2,'food':{'name':'Tomaten'},'unit':None,'note':'gewürfelt'}],
            'instructions':[{'text':'Kochen <b>und</b> servieren.'}],'original_url':'https://www.chefkoch.de/rezepte/12345/Pasta.html'}
RAW_PLAN=[{'mealplan_id':7,'entry_type':'dinner','mealplan_date':'2026-11-10','recipe':RAW_RECIPE,'title':None,'description':None},
          {'mealplan_id':8,'entry_type':'lunch','mealplan_date':'2026-11-10','recipe':RAW_RECIPE,'title':None}]

class RecipeTests(unittest.TestCase):
    def test_url_allowlist(self):
        self.assertEqual(chefkoch_url('https://chefkoch.de/rezepte/12345/Pasta.html?tracking=1#x'),'https://www.chefkoch.de/rezepte/12345/Pasta.html')
        for url in ['http://chefkoch.de/rezepte/123/a','https://chefkoch.de.evil.example/rezepte/123/a','https://user@chefkoch.de/rezepte/123/a','https://127.0.0.1/x','https://www.chefkoch.de/suche','https://www.chefkoch.de:8443/rezepte/123/a']:
            with self.assertRaises(ValueError):chefkoch_url(url)

    def test_schema_normalization(self):
        r=recipe_details(RAW_RECIPE)
        self.assertEqual(r['ingredients'],['200 g Pasta','2 Tomaten gewürfelt'])
        self.assertEqual(r['image'],'api/recipes/'+RID+'/image')
        self.assertEqual(r['steps'],['Kochen <b>und</b> servieren.'])
        self.assertEqual(len(normalize_plan(RAW_PLAN)),1)
        self.assertIsNone(recipe_details({**RAW_RECIPE,'image':None,'original_url':'javascript:alert(1)'})['sourceUrl'])

class MealApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.ha=AsyncMock()
        async def service(domain,name,payload,response=False):
            if name=='get_mealplan':return {'mealplan':RAW_PLAN}
            if name=='get_recipe':return {'recipe':RAW_RECIPE}
            if name=='get_recipes':return {'recipes':{'items':[RAW_RECIPE]}}
            return {'mealplan':{}}
        self.ha.service.side_effect=service
        self.app=make_app(self.ha,':memory:',options={'mealie_entry_id':'test-entry'})

    async def asyncTearDown(self):self.app['db'].close()

    def req(self,data,key='mealie-request-12345'):
        req=make_mocked_request('POST','/api/meals/actions',headers={'Idempotency-Key':key},app=self.app)
        req.json=AsyncMock(return_value=data)
        return req

    async def test_add_and_replace_use_different_services(self):
        base={'action':'plan','date':'2026-11-10','recipeId':RID,'revision':revision(normalize_plan(RAW_PLAN))}
        for target,name,key in [(None,'set_mealplan','adding-request-12345'),('7','update_mealplan','replace-request-12345')]:
            response=await meal_write(self.req({**base,'targetId':target},key))
            self.assertEqual(response.status,200)
            call=self.ha.service.call_args
            self.assertEqual(call.args[1],name)
            self.assertEqual(call.args[2]['entry_type'],'dinner')
            if target:self.assertEqual(call.args[2]['mealplan_id'],target)

    async def test_conflict_and_duplicate(self):
        data={'action':'remove','date':'2026-11-10','targetId':'7','revision':'0'*64}
        response=await meal_write(self.req(data));self.assertEqual(response.status,409)
        self.assertFalse(any(c.args[1]=='delete_mealplan' for c in self.ha.service.call_args_list))
        data['revision']=revision(normalize_plan(RAW_PLAN))
        for _ in range(2):self.assertEqual((await meal_write(self.req(data))).status,200)
        self.assertEqual(sum(c.args[1]=='delete_mealplan' for c in self.ha.service.call_args_list),1)

    async def test_uncertain_import_not_replayed(self):
        self.ha.service.side_effect=TimeoutError()
        data={'action':'import','url':'https://www.chefkoch.de/rezepte/12345/Test.html'}
        self.assertEqual((await meal_write(self.req(data))).status,502)
        self.assertEqual((await meal_write(self.req(data))).status,409)
        self.assertEqual(self.ha.service.await_count,1)

    async def test_reads_and_unknown_image(self):
        r=make_mocked_request('GET','/api/meals?start=2026-11-09&end=2026-11-16',app=self.app)
        data=json.loads((await get_plan(r)).text)
        self.assertEqual(len(data['revisions']),7);self.assertEqual(data['entries'][0]['title'],'Pasta <Test>')
        r=make_mocked_request('GET','/api/recipes?q=pasta',app=self.app)
        self.assertEqual(json.loads((await get_recipes(r)).text)['recipes'][0]['id'],RID)
        self.app['recipe_ids'].clear()
        r=make_mocked_request('GET','/api/recipes/'+RID+'/image',match_info={'recipe_id':RID},app=self.app)
        with self.assertRaises(web.HTTPNotFound):await get_image(r)

    async def test_ha_service_unwraps_rest_response(self):
        ha=HomeAssistant(None,'unused');ha.request=AsyncMock(return_value={'changed_states':[],'service_response':{'recipes':{'items':[]}}})
        result=await ha.service('mealie','get_recipes',{},response=True)
        self.assertEqual(result,{'recipes':{'items':[]}})
        self.assertEqual(ha.request.call_args.kwargs['params'],{'return_response':''})

if __name__=='__main__':unittest.main()
