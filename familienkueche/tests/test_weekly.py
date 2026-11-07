import json
import unittest
from unittest.mock import AsyncMock
from aiohttp.test_utils import make_mocked_request
from server import make_app
from weekly import aggregate, context, preview, transfer
from datetime import date

A='a1234567-1234-4234-9234-123456789abc'
B='b1234567-1234-4234-9234-123456789abc'
def recipe(rid,quantity,unit,food='Tomaten',note=''):
    return {'recipe_id':rid,'name':'Gericht '+rid[0],'recipe_servings':3,'ingredients':[{'quantity':quantity,'food':{'food_id':food,'name':food},'unit':{'name':unit},'note':note,'display':str(quantity)+' '+unit+' '+food}]}
def entry(rid,n=1):return {'id':str(n),'date':'2026-11-10','title':'Gericht','recipe':{'id':rid}}
CURRENT={'items':[],'canAdd':True,'label':'Bring'}

class AggregationTests(unittest.TestCase):
    def test_mass_volume_counts_and_dimensions(self):
        for unit1,unit2,q1,q2,wanted in [('g','kg',200,.3,'500 g Tomaten'),('ml','l',500,.75,'1,25 l Tomaten'),('Stück','Stück',2,3,'5 Stück Tomaten')]:
            rows=aggregate([entry(A),entry(B,2)],{A:recipe(A,q1,unit1),B:recipe(B,q2,unit2)},3,CURRENT)
            self.assertEqual(len(rows),1);self.assertEqual(rows[0]['text'],wanted);self.assertTrue(rows[0]['combined'])
        rows=aggregate([entry(A),entry(B,2)],{A:recipe(A,200,'g'),B:recipe(B,1,'l')},3,CURRENT)
        self.assertEqual(len(rows),2,'Never guess volume from mass')

    def test_preparation_notes_and_repeated_meals(self):
        rows=aggregate([entry(A),entry(B,2)],{A:recipe(A,200,'g',note='gewürfelt'),B:recipe(B,300,'g',note='ganz')},3,CURRENT)
        self.assertEqual(len(rows),2)
        rows=aggregate([entry(A),entry(A,2)],{A:recipe(A,200,'g')},3,CURRENT)
        self.assertEqual(rows[0]['text'],'400 g Tomaten');self.assertEqual(len(rows[0]['sources']),2)

    def test_portions_free_text_and_existing_total(self):
        r=recipe(A,200,'g');r['recipe_servings']=2
        rows=aggregate([entry(A)],{A:r},3,{**CURRENT,'items':[{'name':'300 g Tomaten','done':False}]})
        self.assertEqual(rows[0]['text'],'300 g Tomaten');self.assertTrue(rows[0]['exists'])
        r['ingredients']=[{'display':'Salz nach Geschmack','quantity':None,'food':None}]
        rows=aggregate([entry(A),entry(A,2)],{A:r},3,CURRENT)
        self.assertEqual(rows[0]['text'],'2 × Salz nach Geschmack');self.assertTrue(rows[0]['needsReview'])

class WeeklyApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.recipes={A:recipe(A,200,'g'),B:recipe(B,.3,'kg')};self.calls=[]
        self.rawplan=[{'mealplan_id':1,'mealplan_date':'2026-11-10','entry_type':'dinner','recipe':self.recipes[A]},
                      {'mealplan_id':2,'mealplan_date':'2026-11-11','entry_type':'dinner','recipe':self.recipes[B]}]
        self.ha=AsyncMock();self.ha.request.return_value={'state':'0','attributes':{'friendly_name':'Bring','supported_features':7}}
        async def service(domain,name,payload,response=False):
            if name=='get_recipe':return {'recipe':self.recipes[payload['recipe_id']]}
            if name=='get_mealplan':return {'mealplan':self.rawplan}
            if name=='get_items':return {'todo.bring':{'items':[]}}
            self.calls.append(payload);return []
        self.ha.service.side_effect=service;self.app=make_app(self.ha,':memory:',options={'shopping_entity':'todo.bring','mealie_entry_id':'test'})
    async def asyncTearDown(self):self.app['db'].close()
    def req(self,payload):
        req=make_mocked_request('POST','/api/ingredients/week/transfer',headers={'Idempotency-Key':'weekly-test-123456789'},app=self.app);req.json=AsyncMock(return_value=payload);return req
    async def test_preview_reviewed_transfer_and_replay(self):
        req=make_mocked_request('GET','/api/ingredients/week?week=2026-11-09&servings=3',app=self.app)
        response=await preview(req);self.assertEqual(response.status,200);p=json.loads(response.text)
        self.assertEqual(p['items'][0]['text'],'500 g Tomaten');self.assertEqual(len(p['dishes']),2)
        data={'week':p['week'],'servings':p['servings'],'batchRevision':p['batchRevision'],'items':[{'index':0,'text':'400 g Tomaten (Vorrat abgezogen)'}]}
        for _ in range(2):self.assertEqual((await transfer(self.req(data))).status,200)
        self.assertEqual(self.calls,[{'entity_id':'todo.bring','item':'400 g Tomaten (Vorrat abgezogen)'}])
    async def test_plan_or_recipe_change_blocks_transfer(self):
        p,_=await context(self.app,date(2026,11,9),3)
        data={'week':p['week'],'servings':3,'batchRevision':p['batchRevision'],'items':[{'index':0,'text':'500 g Tomaten'}]}
        self.recipes[A]['ingredients'][0]['quantity']=300
        response=await transfer(self.req(data));self.assertEqual(response.status,409);self.assertEqual(self.calls,[])
    async def test_empty_week_and_note_only_meals(self):
        self.rawplan=[{'mealplan_id':3,'mealplan_date':'2026-11-10','entry_type':'dinner','recipe':None,'title':'Auswärts'}]
        p,_=await context(self.app,date(2026,11,9),3)
        self.assertEqual(p['items'],[]);self.assertFalse(p['dishes'][0]['hasRecipe'])

if __name__=='__main__':unittest.main()
