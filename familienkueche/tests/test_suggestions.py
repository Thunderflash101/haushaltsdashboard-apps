import json
import unittest
from datetime import date
from unittest.mock import AsyncMock
from aiohttp.test_utils import make_mocked_request
from server import make_app
from recipe_meta import duration_minutes, metadata
from suggestions import rank_recipes, get_suggestions

RID='a1234567-1234-4234-9234-123456789abc'
def recipe(rid,name,favorite=False,vegetarian=False,minutes=None,last=None):
    return {'id':rid,'name':name,'favorite':favorite,'vegetarian':vegetarian,'minutes':minutes,'lastMade':last}

class MetadataTests(unittest.TestCase):
    def test_duration_formats_and_unknowns(self):
        for text,wanted in [('PT1H20M',80),('PT29M30S',29.5),('30 Minuten',30),('30 minutes',30),('1 Stunde 20 Minuten',80),('1 hour 20 minutes',80),('00:25:00',25),('20',20)]:
            self.assertEqual(duration_minutes(text),wanted,text)
        for text in [None,'','20–30 Minuten','nach Geschmack','PT0M','-5','1:99']:
            self.assertIsNone(duration_minutes(text),text)

    def test_explicit_classification_and_no_prep_only_guess(self):
        m=metadata({'tags':[{'name':'Familienfavorit'},{'slug':'vegan'}],'total_time':None,'prep_time':'10 Minuten'})
        self.assertTrue(m['favorite']);self.assertTrue(m['vegetarian']);self.assertIsNone(m['minutes'])
        m=metadata({'name':'Vegetarische Pasta schnell','tags':[{'name':'nicht vegetarisch'}],'total_time':'PT40M'})
        self.assertFalse(m['vegetarian']);self.assertFalse(m['favorite']);self.assertEqual(m['minutes'],40)
        self.assertEqual(metadata({'prep_time':'10 min','perform_time':'15 min'})['minutes'],25)

class RankingTests(unittest.TestCase):
    def test_favorites_recency_and_existing_week_plan(self):
        rows=[recipe('favorite','Favorit',True),recipe('recent','Gerade gekocht',True,last='2026-11-06'),recipe('plain','Abwechslung'),recipe('planned','Schon geplant',True)]
        result=rank_recipes(rows,[],[('planned','2026-11-08')],date(2026,11,7),'2026-11-02')
        ids=[r['id'] for r in result];self.assertEqual(ids[0],'favorite');self.assertLess(ids.index('plain'),ids.index('recent'));self.assertLess(ids.index('plain'),ids.index('planned'))
        self.assertEqual(next(r for r in result if r['id']=='recent')['lastSeenSource'],'cooked')

    def test_filters_exact_under_thirty_and_planned_not_cooked(self):
        rows=[recipe('a','Kurz',True,True,29),recipe('b','30 Minuten',True,True,30),recipe('c','Unbekannt',True,True,None),recipe('d','Fleisch',True,False,15)]
        result=rank_recipes(rows,[('a','2026-11-04')],[],date(2026,11,7),'2026-11-02',vegetarian=True,quick=True,favorites=True)
        self.assertEqual([x['id'] for x in result],['a']);self.assertEqual(result[0]['lastSeenSource'],'planned')
        self.assertEqual(rank_recipes(rows,[],[],date(2026,11,7),'2026-11-02'),rank_recipes(rows,[],[],date(2026,11,7),'2026-11-02'))

class SuggestionApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_history_failure_does_not_fabricate_success(self):
        ha=AsyncMock()
        async def service(domain,name,data,response=False):
            if name=='get_recipes':return {'recipes':{'items':[{'recipe_id':RID,'name':'Pasta','tags':[{'name':'Familienfavorit'}],'total_time':'PT20M'}]}}
            raise TimeoutError()
        ha.service.side_effect=service
        app=make_app(ha,':memory:',options={'mealie_entry_id':'test'})
        req=make_mocked_request('GET','/api/suggestions?week=2026-11-02&quick=1',app=app)
        result=await get_suggestions(req);data=json.loads(result.text)
        self.assertEqual(result.status,200);self.assertTrue(data['recipes'][0]['favorite']);self.assertEqual(len(data['warnings']),2)
        self.assertTrue(any(c.args[2].get('result_limit')==100 for c in ha.service.call_args_list));app['db'].close()

if __name__=='__main__':unittest.main()
