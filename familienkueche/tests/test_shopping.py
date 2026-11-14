import json
import unittest
from unittest.mock import AsyncMock
from aiohttp.test_utils import make_mocked_request
from server import make_app
from shopping import normalize_items, validate_action, get_list, get_count, shopping_write

RAW=[{'uid':'uid-one','summary':'Milch','status':'needs_action','description':''},
     {'uid':'uid-two','summary':'Milch','status':'completed','description':'Andere Packung'}]

class ShoppingTests(unittest.TestCase):
    def test_identity_and_revision(self):
        rows=normalize_items(RAW)
        self.assertNotEqual(rows[0]['id'],rows[1]['id']);self.assertFalse(rows[0]['done']);self.assertTrue(rows[1]['done'])
        changed=normalize_items([{**RAW[0],'summary':'Brot'}])[0]
        self.assertNotEqual(changed['revision'],rows[0]['revision'])
        with self.assertRaises(ValueError):normalize_items([RAW[0],RAW[0]])

    def test_invalid_payloads(self):
        for data in [{'action':'add','name':' '},{'action':'add','name':'a'*201},{'action':'other'},
                     {'action':'status','id':'x','revision':'a'*64,'done':'true'}]:
            with self.assertRaises(ValueError):validate_action(data)

class ShoppingApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.ha=AsyncMock();self.ha.request.return_value={'state':'1','attributes':{'friendly_name':'Gemeinsamer Einkauf','supported_features':7}}
        self.ha.service.return_value={'todo.einkaufsliste':{'items':RAW}}
        self.app=make_app(self.ha,':memory:')

    async def asyncTearDown(self):self.app['db'].close()

    def req(self,data,key='shopping-request-12345'):
        req=make_mocked_request('POST','/api/shopping/actions',headers={'Idempotency-Key':key},app=self.app)
        req.json=AsyncMock(return_value=data);return req

    async def test_fast_count_never_fetches_items(self):
        req=make_mocked_request('GET','/api/shopping/count',app=self.app)
        result=await get_count(req)
        self.assertEqual(json.loads(result.text), {'count':1})
        self.ha.service.assert_not_awaited()
        self.ha.request.assert_awaited_once_with('GET','states/todo.einkaufsliste')

    async def test_unavailable_or_invalid_count_is_not_zero(self):
        req=make_mocked_request('GET','/api/shopping/count',app=self.app)
        for raw in ['unavailable','unknown',None,'-1','1.5',False,'1e3']:
            self.ha.request.return_value={'state':raw}
            self.assertEqual((await get_count(req)).status,502)
        self.ha.request.return_value={'state':'0'}
        self.assertEqual(json.loads((await get_count(req)).text),{'count':0})
        self.ha.service.assert_not_awaited()

    async def test_read_and_uid_status_restore(self):
        req=make_mocked_request('GET','/api/shopping',app=self.app)
        result=json.loads((await get_list(req)).text)
        self.assertEqual(len(result['items']),2);self.assertTrue(result['canUpdate'])
        row=result['items'][1]
        data={'action':'status','id':row['id'],'revision':row['revision'],'done':False}
        self.assertEqual((await shopping_write(self.req(data))).status,200)
        self.assertEqual(self.ha.service.call_args.args,('todo','update_item',{'entity_id':'todo.einkaufsliste','item':'uid-two','status':'needs_action'}))

    async def test_add_duplicate_and_idempotency(self):
        self.assertEqual((await shopping_write(self.req({'action':'add','name':' milch '}))).status,409)
        data={'action':'add','name':'Brot'}
        for _ in range(2):self.assertEqual((await shopping_write(self.req(data))).status,200)
        self.assertEqual(sum(c.args[1]=='add_item' for c in self.ha.service.call_args_list),1)

    async def test_remove_revision_and_feature_guard(self):
        row=normalize_items(RAW)[0]
        data={'action':'remove','id':row['id'],'revision':'0'*64}
        self.assertEqual((await shopping_write(self.req(data))).status,409)
        self.assertFalse(any(c.args[1]=='remove_item' for c in self.ha.service.call_args_list))
        data['revision']=row['revision'];self.ha.request.return_value['attributes']['supported_features']=0
        self.assertEqual((await shopping_write(self.req(data))).status,403)

    async def test_rename_preserves_uid_and_unknown_write_not_replayed(self):
        row=normalize_items(RAW)[0];data={'action':'rename','id':row['id'],'revision':row['revision'],'name':'Hafermilch'}
        self.assertEqual((await shopping_write(self.req(data))).status,200)
        self.assertEqual(self.ha.service.call_args.args[2]['item'],'uid-one')
        self.assertEqual(self.ha.service.call_args.args[2]['rename'],'Hafermilch')
        async def service(domain,name,payload,response=False):
            if name=='get_items':return {'todo.einkaufsliste':{'items':RAW}}
            raise TimeoutError()
        self.ha.service.side_effect=service
        add={'action':'add','name':'Äpfel'}
        self.assertEqual((await shopping_write(self.req(add,'other-shopping-12345'))).status,502)
        before=self.ha.service.await_count
        self.assertEqual((await shopping_write(self.req(add,'other-shopping-12345'))).status,409)
        self.assertEqual(self.ha.service.await_count,before)

if __name__=='__main__':unittest.main()
