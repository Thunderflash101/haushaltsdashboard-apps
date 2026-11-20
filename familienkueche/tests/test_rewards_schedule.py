import json
import unittest
from datetime import date,timedelta
from unittest.mock import AsyncMock,patch
from aiohttp.test_utils import make_mocked_request
from server import make_app
import family
import family_schedule as schedule
import rewards


class ScheduleTests(unittest.TestCase):
    def item(self,**extra):
        return dict(startDate='2026-01-31',weekdays=[],**extra)

    def test_month_end_and_leap_year(self):
        item=self.item(repeat=dict(kind='monthly',interval=1,monthDay=31))
        self.assertTrue(schedule.scheduled(item,date(2026,2,28)))
        self.assertFalse(schedule.scheduled(item,date(2026,2,27)))
        self.assertTrue(schedule.scheduled(item,date(2026,3,31)))
        self.assertEqual(schedule.index(item,date(2026,3,31)),2)
        item['startDate']='2024-01-31';item['repeat']['monthDay']=0
        self.assertTrue(schedule.scheduled(item,date(2024,2,29)))

    def test_biweekly_and_rotation_rank_matches_actual_occurrences(self):
        item=dict(startDate='2026-01-07',weekdays=[0,2,4],repeat=dict(kind='weekly',interval=2,monthDay=7))
        self.assertTrue(schedule.scheduled(item,date(2026,1,9)))
        self.assertFalse(schedule.scheduled(item,date(2026,1,12)))
        self.assertTrue(schedule.scheduled(item,date(2026,1,19)))
        rank=0
        for offset in range(500):
            day=date(2026,1,7)+timedelta(days=offset)
            if schedule.scheduled(item,day):
                self.assertEqual(schedule.index(item,day),rank);rank+=1

    def test_monthly_rank_when_first_candidate_precedes_start(self):
        item=self.item(repeat=dict(kind='monthly',interval=2,monthDay=15))
        self.assertFalse(schedule.scheduled(item,date(2026,1,15)))
        self.assertTrue(schedule.scheduled(item,date(2026,3,15)))
        self.assertEqual(schedule.index(item,date(2026,3,15)),0)
        self.assertEqual(schedule.index(item,date(2026,5,15)),1)


class RewardsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.app=make_app(AsyncMock(),':memory:');self.day=family.today();self.counter=0

    async def asyncTearDown(self):self.app['db'].close()

    def task(self,**kw):
        result=dict(kind='task',title='Testaufgabe',person='alle',assignees=['tina','joern'],completionMode='individual',icon='check',startDate=self.day.isoformat(),weekdays=[],steps=[],points=5)
        result.update(kw);return result

    def items(self,day=None):return family.snapshot(self.app,day or self.day)['items']

    async def write(self,data,reward=False,key=None):
        self.counter+=1;req=make_mocked_request('POST','/api/rewards/actions' if reward else '/api/family/actions',app=self.app,headers={'Idempotency-Key':key or 'rewards-test-request-%04d'%self.counter});req.json=AsyncMock(return_value=data)
        response=await (rewards.write(req) if reward else family.write_item(req))
        return response.status,json.loads(response.text)

    async def mark(self,person='tina',done=True,step='task',key=None):
        x=self.items()[0];row=next((p for p in x['personProgress'] if p['person']==person),x)
        payload=dict(action='check',id=x['id'],revision=x['revision'],date=self.day.isoformat(),progressRevision=row['progressRevision'],step=step,done=done)
        if x['completionMode']=='individual':payload['person']=person
        return await self.write(payload,key=key)

    def balances(self):return rewards.state(self.app)['balances']

    async def test_credit_once_undo_and_frozen_amount(self):
        self.assertEqual((await self.write(dict(action='create',item=self.task())))[0],200)
        await self.mark(key='same-check-request-12345');self.assertEqual(self.balances()['tina'],5);self.assertEqual(self.balances()['joern'],0)
        await self.mark();self.assertEqual(self.balances()['tina'],5)
        x=self.items()[0];edited=self.task(points=20)
        await self.write(dict(action='edit',id=x['id'],revision=x['revision'],completionRevision=x['completionRevision'],item=edited))
        await self.mark(done=False);self.assertEqual(self.balances()['tina'],0)
        await self.mark();self.assertEqual(self.balances()['tina'],5)
        await self.mark('joern');self.assertEqual(self.balances()['joern'],20)
        self.app['ha'].service.assert_not_called();self.app['ha'].request.assert_not_called()

    async def test_redemption_atomic_receipts_reverse_and_negative_balance(self):
        await self.write(dict(action='create',item=self.task()));await self.mark()
        await self.write(dict(action='create',title='Spieleabend',cost=4),reward=True)
        r=rewards.state(self.app)['rewards'][0];payload=dict(action='redeem',id=r['id'],revision=r['revision'],person='tina')
        first=await self.write(payload,reward=True,key='redeem-same-request-12345');second=await self.write(payload,reward=True,key='redeem-same-request-12345');self.assertEqual(first,second)
        self.assertEqual(self.balances()['tina'],1);self.assertEqual(len(rewards.state(self.app)['history']),1)
        await self.mark(done=False);self.assertEqual(self.balances()['tina'],-4)
        self.assertEqual((await self.write(payload,reward=True))[0],400)
        entry=rewards.state(self.app)['history'][0]
        self.assertEqual((await self.write(dict(action='reverse',id=entry['id']),reward=True))[0],200)
        self.assertEqual(self.balances()['tina'],0)
        self.assertEqual((await self.write(dict(action='reverse',id=entry['id']),reward=True))[0],409)
        await self.mark();self.assertEqual(self.balances()['tina'],5)

    async def test_routine_only_awards_on_full_completion(self):
        await self.write(dict(action='create',item=self.task(kind='routine',weekdays=list(range(7)),steps=[dict(title='Eins',icon='check'),dict(title='Zwei',icon='heart')])) )
        x=self.items()[0];await self.mark(step=x['steps'][0]['id']);self.assertEqual(self.balances()['tina'],0)
        await self.mark(step=x['steps'][1]['id']);self.assertEqual(self.balances()['tina'],5)
        await self.mark(step=x['steps'][0]['id'],done=False);self.assertEqual(self.balances()['tina'],0)
        await self.mark(step=x['steps'][0]['id']);self.assertEqual(self.balances()['tina'],5)

    async def test_shared_awards_every_assignee_and_survives_item_removal(self):
        await self.write(dict(action='create',item=self.task(completionMode='shared')));await self.mark()
        self.assertEqual(self.balances(),{'tina':5,'joern':5,'felix':0})
        x=self.items()[0];await self.write(dict(action='remove',id=x['id'],revision=x['revision']))
        self.assertEqual(self.balances()['tina'],5)

    async def test_rotation_assignment_and_wrong_person_refusal(self):
        item=self.task(weekdays=list(range(7)),rotation=True,repeat=dict(kind='weekly',interval=1,monthDay=self.day.day))
        await self.write(dict(action='create',item=item));x=self.items()[0]
        self.assertEqual(x['assignees'],['tina']);self.assertEqual(x['configuredAssignees'],['tina','joern'])
        tomorrow=self.items(self.day+timedelta(days=1))[0];self.assertEqual(tomorrow['assignees'],['joern'])
        self.assertEqual((await self.mark('joern'))[0],400)
        self.assertEqual((await self.mark())[0],200);self.assertEqual(self.balances()['tina'],5)

    async def test_reward_revision_and_price_history(self):
        await self.write(dict(action='create',item=self.task(points=10)));await self.mark()
        await self.write(dict(action='create',title='Belohnung',cost=4),reward=True);r=rewards.state(self.app)['rewards'][0]
        await self.write(dict(action='edit',id=r['id'],revision=r['revision'],title='Neu',cost=6),reward=True)
        self.assertEqual((await self.write(dict(action='redeem',id=r['id'],revision=r['revision'],person='tina'),reward=True))[0],409)
        r=rewards.state(self.app)['rewards'][0];await self.write(dict(action='redeem',id=r['id'],revision=r['revision'],person='tina'),reward=True)
        await self.write(dict(action='remove',id=r['id'],revision=r['revision']),reward=True)
        self.assertEqual(rewards.state(self.app)['history'][0]['cost'],6);self.assertEqual(self.balances()['tina'],4)

    async def test_schedule_changes_require_latest_check_stamp(self):
        await self.write(dict(action='create',item=self.task()));x=self.items()[0];await self.mark()
        changed=self.task(repeat=dict(kind='monthly',interval=1,monthDay=0))
        self.assertEqual((await self.write(dict(action='edit',id=x['id'],revision=x['revision'],completionRevision=x['completionRevision'],item=changed)))[0],409)

    async def test_legacy_client_cannot_drop_rotating_assignments(self):
        item=self.task(weekdays=list(range(7)),rotation=True,repeat=dict(kind='weekly',interval=1,monthDay=self.day.day))
        await self.write(dict(action='create',item=item));x=self.items()[0]
        legacy=self.task(assignees=x['assignees'],weekdays=list(range(7)))
        status,_=await self.write(dict(action='edit',id=x['id'],revision=x['revision'],completionRevision=x['completionRevision'],item=legacy))
        self.assertEqual(status,409);self.assertEqual(self.items()[0]['configuredAssignees'],['tina','joern'])

    async def test_balances_rewards_and_checks_persist_on_reopen(self):
        import sqlite3,tempfile
        from pathlib import Path
        await self.write(dict(action='create',item=self.task()));await self.mark()
        await self.write(dict(action='create',title='Dauerhafte Belohnung',cost=4),reward=True)
        with tempfile.TemporaryDirectory() as tmp:
            path=str(Path(tmp)/'saved.sqlite');target=sqlite3.connect(path);self.app['db'].backup(target);target.close()
            reopened=make_app(AsyncMock(),path)
            try:
                self.assertEqual(rewards.state(reopened)['balances']['tina'],5)
                self.assertEqual(rewards.state(reopened)['rewards'][0]['cost'],4)
                self.assertTrue(family.snapshot(reopened,self.day)['items'][0]['personProgress'][0]['done'])
            finally:reopened['db'].close()

    async def test_chest_draw_is_atomic_and_unfulfilled_prize_survives_reward_removal(self):
        await self.write(dict(action='create', item=self.task(points=10)))
        _, credited = await self.mark()
        self.assertEqual(credited['credits'], {'tina':10})
        draw = dict(action='open-chest', person='tina', cost=10)
        self.assertEqual((await self.write(draw,reward=True))[0],400)
        await self.write(dict(action='create',title='Spiel wählen',cost=3,tier=10),reward=True)
        first = await self.write(draw,reward=True,key='same-chest-request-001')
        self.assertEqual(first,await self.write(draw,reward=True,key='same-chest-request-001'))
        self.assertEqual(first[1]['title'],'Spiel wählen')
        self.assertEqual(self.balances()['tina'],0)
        self.assertEqual((await self.write(draw,reward=True))[0],400)
        state = rewards.state(self.app)
        reward = state['rewards'][0]
        await self.write(dict(action='remove',id=reward['id'],revision=reward['revision']),reward=True)
        self.assertEqual(rewards.state(self.app)['prizes'],state['prizes'])
        claim = dict(action='fulfill',id=state['prizes'][0]['id'])
        self.assertEqual((await self.write(claim,reward=True))[0],200)
        self.assertEqual(rewards.state(self.app)['prizes'],[])
        self.assertEqual(self.balances()['tina'],0)
