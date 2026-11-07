import json
import unittest
from unittest.mock import AsyncMock
from aiohttp.test_utils import make_mocked_request
from server import make_app
from ingredients import build_preview, recipe_revision, transfer, quantity_text

RID='a1234567-1234-4234-9234-123456789abc'
RECIPE={'recipe_id':RID,'name':'Pasta','recipe_servings':2,'ingredients':[
    {'quantity':400,'unit':{'name':'g'},'food':{'name':'Pasta'},'note':'','display':'400 g Pasta'},
    {'quantity':2,'unit':None,'food':{'name':'Tomaten'},'note':'','display':'2 Tomaten'},
    {'quantity':None,'food':None,'note':'Salz nach Geschmack','display':'Salz nach Geschmack'}]}
CURRENT={'items':[{'name':'600 g Pasta','done':False}],'label':'Bring','canAdd':True}

class PreviewTests(unittest.TestCase):
    def test_scaling_and_unstructured_text(self):
        p=build_preview(RECIPE,3,CURRENT)
        self.assertEqual([x['text'] for x in p['items']],['600 g Pasta','3 Tomaten','Salz nach Geschmack'])
        self.assertTrue(p['items'][0]['exists']);self.assertTrue(p['items'][2]['needsReview'])
        self.assertEqual(quantity_text(.5),'0,5');self.assertEqual(quantity_text(.0002),'0,0002')
        p=build_preview({**RECIPE,'recipe_servings':None},3,CURRENT)
        self.assertEqual(p['items'][0]['text'],'400 g Pasta')

class TransferTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.ha=AsyncMock();self.ha.request.return_value={'state':'1','attributes':{'friendly_name':'Bring','supported_features':7}}
        self.calls=[];self.fail_at=None
        async def service(domain,name,payload,response=False):
            if name=='get_recipe':return {'recipe':RECIPE}
            if name=='get_items':return {'todo.bring':{'items':[{'uid':'x','summary':'600 g Pasta','status':'needs_action'}]}}
            self.calls.append(payload)
            if self.fail_at==len(self.calls):raise TimeoutError()
            return []
        self.ha.service.side_effect=service
        self.app=make_app(self.ha,':memory:',options={'shopping_entity':'todo.bring','mealie_entry_id':'test-entry'})

    async def asyncTearDown(self):self.app['db'].close()

    def req(self,rows,revision=None):
        payload={'recipeId':RID,'servings':3,'recipeRevision':revision or recipe_revision(RECIPE),'items':rows}
        req=make_mocked_request('POST','/api/ingredients/transfer',headers={'Idempotency-Key':'ingredient-test-123456'},app=self.app)
        req.json=AsyncMock(return_value=payload);return req

    async def test_selected_edited_rows_duplicates_and_replay(self):
        rows=[{'index':0,'text':'600 g Pasta'},{'index':1,'text':'3 große Tomaten'}]
        for _ in range(2):
            response=await transfer(self.req(rows));self.assertEqual(response.status,200)
            receipt=json.loads(response.text);self.assertEqual(receipt['added'],1);self.assertEqual(receipt['skipped'],1)
        self.assertEqual(self.calls,[{'entity_id':'todo.bring','item':'3 große Tomaten'}])

    async def test_partial_failure_never_replays(self):
        self.fail_at=2
        rows=[{'index':0,'text':'Pasta'},{'index':1,'text':'Tomaten'},{'index':2,'text':'Salz'}]
        response=await transfer(self.req(rows));self.assertEqual(response.status,502)
        receipt=json.loads(response.text);self.assertEqual(receipt['added'],1);self.assertEqual(receipt['remaining'],2);self.assertTrue(receipt['uncertain'])
        self.assertEqual((await transfer(self.req(rows))).status,409);self.assertEqual(len(self.calls),2)

    async def test_changed_recipe_and_invalid_rows_are_not_written(self):
        self.assertEqual((await transfer(self.req([{'index':0,'text':'Pasta'}],'0'*64))).status,409)
        self.assertEqual((await transfer(self.req([{'index':0,'text':'a'*201}]))).status,400)
        self.assertEqual(self.calls,[])

if __name__=='__main__':unittest.main()
