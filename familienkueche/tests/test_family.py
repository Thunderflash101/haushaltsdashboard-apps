import json
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch

from aiohttp.test_utils import make_mocked_request
from server import make_app
from family import definition, get_items, write_item, today


class FamilyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.app = make_app(AsyncMock(), ':memory:')
        self.day = today()
        self.index = 0

    async def asyncTearDown(self):
        self.app['db'].close()

    def task(self, **changes):
        return dict(kind='task', title='Spülmaschine ausräumen', person='joern', icon='dishes',
                    startDate=self.day.isoformat(), weekdays=[], steps=[], **changes)

    def routine(self):
        return dict(kind='routine', title='Guten Morgen', person='felix', icon='sun',
                    startDate=self.day.isoformat(), weekdays=list(range(7)),
                    steps=[dict(title='Anziehen', icon='shirt'), dict(title='Zähne putzen', icon='tooth')])

    async def write(self, data, key=None):
        self.index += 1
        req = make_mocked_request('POST', '/api/family/actions', app=self.app,
                                 headers={'Idempotency-Key': key or 'family-test-request-%03d' % self.index})
        req.json = AsyncMock(return_value=data)
        result = await write_item(req)
        return result.status, json.loads(result.text)

    async def items(self, day=None):
        req = make_mocked_request('GET', '/api/family?date=' + (day or self.day).isoformat(), app=self.app)
        return json.loads((await get_items(req)).text)['items']

    async def mark(self, item, step='task', done=True, day=None):
        return await self.write(dict(action='check', id=item['id'], revision=item['revision'],
                                     progressRevision=item['progressRevision'], date=(day or self.day).isoformat(),
                                     step=step, done=done))

    async def test_create_is_idempotent_and_local(self):
        data = dict(action='create', item=self.task())
        a = await self.write(data, 'same-family-request-123')
        b = await self.write(data, 'same-family-request-123')
        self.assertEqual(a, b)
        self.assertEqual(a[0], 200)
        self.assertEqual(len(await self.items()), 1)
        status, _ = await self.write(dict(action='create', item=self.routine()), 'same-family-request-123')
        self.assertEqual(status, 409)
        self.app['ha'].request.assert_not_called()
        self.app['ha'].service.assert_not_called()

    async def test_once_stays_done_late_tasks_stay_open_and_future_refused(self):
        await self.write(dict(action='create', item=self.task()))
        item = (await self.items())[0]
        tomorrow = self.day + timedelta(days=1)
        self.assertTrue((await self.items(tomorrow))[0]['active'])
        self.assertFalse((await self.items(tomorrow))[0]['done'])
        self.assertEqual((await self.mark(item, day=tomorrow))[0], 400)
        self.assertEqual((await self.mark(item))[0], 200)
        self.assertTrue((await self.items(tomorrow))[0]['done'])
        self.assertEqual((await self.mark(item, done=False))[0], 409, 'Stale second-device progress rejected')
        current = (await self.items())[0]
        self.assertEqual((await self.mark(current, done=False))[0], 200)
        self.assertFalse((await self.items())[0]['done'])

    async def test_routines_reset_per_day_and_off_days_not_checkable(self):
        await self.write(dict(action='create', item=self.routine()))
        item = (await self.items())[0]
        for step in item['steps']:
            current = (await self.items())[0]
            self.assertEqual((await self.mark(current, step=step['id']))[0], 200)
        self.assertTrue((await self.items())[0]['done'])
        self.assertFalse((await self.items(self.day + timedelta(days=1)))[0]['done'])
        edited = self.routine()
        edited['weekdays'] = [(self.day.weekday() + 1) % 7]
        current = (await self.items())[0]
        await self.write(dict(action='edit', id=item['id'], revision=current['revision'], item=edited))
        current = (await self.items())[0]
        self.assertFalse(current['active'])
        self.assertEqual((await self.mark(current, step=current['steps'][0]['id']))[0], 400)

    async def test_edit_steps_preserves_only_unchanged_steps_and_delete_conflicts(self):
        await self.write(dict(action='create', item=self.routine()))
        current = (await self.items())[0]
        await self.mark(current, step=current['steps'][0]['id'])
        current = (await self.items())[0]
        edited = dict(current)
        edited['steps'] = [dict(s) for s in current['steps']]
        edited['steps'][1]['title'] = 'Gemeinsam lesen'
        status, _ = await self.write(dict(action='edit', id=current['id'], revision=current['revision'], item=edited))
        self.assertEqual(status, 200)
        new = (await self.items())[0]
        self.assertTrue(new['steps'][0]['done'])
        self.assertEqual(new['steps'][0]['id'], current['steps'][0]['id'])
        self.assertNotEqual(new['steps'][1]['id'], current['steps'][1]['id'])
        self.assertEqual((await self.write(dict(action='remove', id=current['id'], revision=current['revision'])))[0], 409)
        self.assertEqual((await self.write(dict(action='remove', id=new['id'], revision=new['revision'])))[0], 200)
        self.assertEqual(await self.items(), [])
        self.assertEqual(self.app['db'].execute('SELECT count(*) FROM family_checks').fetchone()[0], 0)

    async def test_persistence_after_restart(self):
        self.app['db'].close()
        with tempfile.TemporaryDirectory() as root:
            path = str(Path(root) / 'family.sqlite')
            self.app = make_app(AsyncMock(), path)
            await self.write(dict(action='create', item=self.routine()))
            current = (await self.items())[0]
            await self.mark(current, step=current['steps'][0]['id'])
            self.app['db'].close()
            self.app = make_app(AsyncMock(), path)
            saved = (await self.items())[0]
            self.assertEqual(saved['id'], current['id'])
            self.assertTrue(saved['steps'][0]['done'])

    async def test_multiple_assignees_shared_progress_and_legacy_edit(self):
        data = self.task()
        data['assignees'] = ['joern', 'tina']
        self.assertEqual((await self.write(dict(action='create', item=data)))[0], 200)
        item = (await self.items())[0]
        self.assertEqual(item['assignees'], ['tina', 'joern'])
        self.assertEqual(item['person'], 'alle')
        self.assertEqual(len(await self.items()), 1)
        self.assertEqual((await self.mark(item))[0], 200)
        item = (await self.items())[0]
        self.assertTrue(item['done'])
        old_client = dict(item)
        del old_client['assignees']
        old_client['title'] = 'Gemeinsam ausräumen'
        self.assertEqual((await self.write(dict(action='edit', id=item['id'], revision=item['revision'], item=old_client)))[0], 200)
        saved = (await self.items())[0]
        self.assertEqual(saved['assignees'], ['tina', 'joern'])
        self.assertTrue(saved['done'])
        self.app['ha'].request.assert_not_called()

    async def test_legacy_records_and_reassignment_preserve_routine_steps(self):
        old = definition(self.routine())
        del old['assignees']
        self.app['db'].execute('INSERT INTO family_items VALUES (?, ?, 1, ?)', ('legacy', json.dumps(old), '2026'))
        self.app['db'].commit()
        item = (await self.items())[0]
        self.assertEqual(item['assignees'], ['felix'])
        await self.mark(item, step=item['steps'][0]['id'])
        item = (await self.items())[0]
        edited = dict(item, assignees=['tina', 'felix'])
        self.assertEqual((await self.write(dict(action='edit', id=item['id'], revision=item['revision'], item=edited)))[0], 200)
        saved = (await self.items())[0]
        self.assertEqual(saved['assignees'], ['tina', 'felix'])
        self.assertTrue(saved['steps'][0]['done'])
        self.assertEqual(saved['steps'][0]['id'], item['steps'][0]['id'])

    async def test_assignee_validation(self):
        for assigned in [[], 'tina', ['tina', 'tina'], ['alle', 'tina'], ['stranger'], [True], [{}], ['tina', 'joern', 'felix', 'alle']]:
            with self.assertRaises(ValueError):
                definition(dict(self.task(), assignees=assigned))
        self.assertEqual(definition(dict(self.task(), assignees=['alle']))['assignees'], ['alle'])
        self.assertEqual(definition(dict(self.task(), assignees=['tina', 'joern', 'felix']))['assignees'], ['tina', 'joern', 'felix'])

    async def test_validation_limits(self):
        for change in [dict(title=' '), dict(person='other'), dict(icon='javascript:bad'), dict(weekdays=[True]), dict(weekdays=[0, 0]), dict(startDate='2026-13-99')]:
            with self.assertRaises(ValueError):
                definition({**self.task(), **change})
        for change in [dict(weekdays=[]), dict(steps=[]), dict(steps=[dict(title='x', icon='check')] * 13)]:
            with self.assertRaises(ValueError):
                definition({**self.routine(), **change})
        req = make_mocked_request('GET', '/api/family?date=2001-01-01', app=self.app)
        self.assertEqual((await get_items(req)).status, 400)

    def individual(self, item=None, assigned=None):
        result=item or self.task()
        return dict(result,completionMode='individual',assignees=assigned or ['tina','joern'])

    async def mark_person(self,item,person,step='task',done=True,day=None,key=None):
        progress=next(row for row in item['personProgress'] if row['person']==person)
        return await self.write(dict(action='check',id=item['id'],revision=item['revision'],person=person,
            progressRevision=progress['progressRevision'],date=(day or self.day).isoformat(),step=step,done=done),key)

    async def test_individual_family_checkmarks_and_independent_person_revisions(self):
        await self.write(dict(action='create',item=self.individual(assigned=['alle'])))
        original=(await self.items())[0]
        self.assertEqual([p['person'] for p in original['personProgress']],['tina','joern','felix'])
        self.assertEqual((await self.mark_person(original,'tina'))[0],200)
        self.assertEqual((await self.mark_person(original,'joern'))[0],200,'Another person changing progress is not a conflict')
        self.assertEqual((await self.mark_person(original,'tina',done=False))[0],409,'The same stale person revision is rejected')
        partial=(await self.items())[0]
        self.assertFalse(partial['done']);self.assertTrue(partial['personProgress'][0]['done']);self.assertFalse(partial['personProgress'][2]['done'])
        self.assertEqual((await self.mark_person(partial,'felix'))[0],200)
        completed=(await self.items())[0];self.assertTrue(completed['done'])
        self.assertEqual((await self.mark_person(completed,'joern',done=False))[0],200)
        reopened=(await self.items())[0];self.assertFalse(reopened['done']);self.assertTrue(reopened['personProgress'][0]['done']);self.assertTrue(reopened['personProgress'][2]['done'])
        self.assertEqual(self.app['db'].execute('SELECT count(*) FROM family_checks').fetchone()[0],0)

    async def test_individual_requires_assigned_person_and_blocks_old_global_clients(self):
        await self.write(dict(action='create',item=self.individual()))
        item=(await self.items())[0]
        self.assertEqual((await self.mark(item))[0],409)
        for person in ('alle','felix','stranger',True,[]):
            status,_=await self.write(dict(action='check',id=item['id'],revision=item['revision'],person=person,
                progressRevision=item['progressRevision'],date=self.day.isoformat(),step='task',done=True))
            self.assertEqual(status,400)
        self.assertFalse((await self.items())[0]['done'])
        self.assertEqual((await self.mark_person(item,'tina',key='personal-idempotent-1234'))[0],200)
        self.assertEqual((await self.mark_person(item,'tina',key='personal-idempotent-1234'))[0],200)
        self.assertEqual((await self.mark_person(item,'joern',key='personal-idempotent-1234'))[0],409)
        self.app['ha'].request.assert_not_called();self.app['ha'].service.assert_not_called()

    async def test_individual_once_persists_but_repeated_occurrences_reset(self):
        await self.write(dict(action='create',item=self.individual()))
        item=(await self.items())[0];await self.mark_person(item,'tina')
        tomorrow=self.day+timedelta(days=1)
        future=(await self.items(tomorrow))[0]
        self.assertTrue(future['personProgress'][0]['done']);self.assertFalse(future['personProgress'][1]['done'])
        self.assertEqual((await self.mark_person(future,'joern',day=tomorrow))[0],400)
        await self.write(dict(action='create',item=self.individual(dict(self.task(),weekdays=list(range(7))))))
        repeated=(await self.items())[1];await self.mark_person(repeated,'tina')
        future=(await self.items(tomorrow))[1]
        self.assertTrue(all(not p['done'] for p in future['personProgress']))

    async def test_routine_steps_are_personal_and_unchanged_steps_survive_edit(self):
        await self.write(dict(action='create',item=self.individual(self.routine())))
        item=(await self.items())[0];first=item['steps'][0]['id']
        await self.mark_person(item,'tina',step=first)
        partial=(await self.items())[0]
        self.assertTrue(partial['personProgress'][0]['steps'][0]['done'])
        self.assertFalse(partial['personProgress'][1]['steps'][0]['done']);self.assertFalse(partial['steps'][0]['done'])
        await self.mark_person(partial,'tina',step=item['steps'][1]['id'])
        current=(await self.items())[0]
        self.assertTrue(current['personProgress'][0]['done']);self.assertFalse(current['done'])
        changed=dict(current,steps=[dict(step) for step in current['steps']]);changed['steps'][1]['title']='Lesen'
        self.assertEqual((await self.write(dict(action='edit',id=current['id'],revision=current['revision'],item=changed)))[0],200)
        after=(await self.items())[0]
        self.assertTrue(after['personProgress'][0]['steps'][0]['done']);self.assertFalse(after['personProgress'][0]['steps'][1]['done'])
        self.assertTrue(all(not p['done'] for p in after['personProgress']))

    async def test_person_reassignment_preserves_remaining_people_and_new_people_start_open(self):
        await self.write(dict(action='create',item=self.individual()))
        original=(await self.items())[0];await self.mark_person(original,'tina');await self.mark_person(original,'joern')
        changed=dict(original,assignees=['tina','felix'])
        stale=dict(action='edit',id=original['id'],revision=original['revision'],completionRevision=original['completionRevision'],item=changed)
        self.assertEqual((await self.write(stale))[0],409)
        current=(await self.items())[0];stale['completionRevision']=current['completionRevision']
        self.assertEqual((await self.write(stale))[0],200)
        saved=(await self.items())[0]
        self.assertEqual([p['person'] for p in saved['personProgress']],['tina','felix'])
        self.assertTrue(saved['personProgress'][0]['done']);self.assertFalse(saved['personProgress'][1]['done'])
        changed=dict(saved,assignees=['tina','joern','felix'])
        self.assertEqual((await self.write(dict(action='edit',id=saved['id'],revision=saved['revision'],completionRevision=saved['completionRevision'],item=changed)))[0],200)
        saved=(await self.items())[0]
        self.assertTrue(saved['personProgress'][0]['done']);self.assertFalse(saved['personProgress'][1]['done'])

    async def test_completion_mode_change_is_explicit_resets_checks_and_guards_concurrency(self):
        await self.write(dict(action='create',item=dict(self.task(),assignees=['tina','joern'])))
        original=(await self.items())[0];await self.mark(original)
        edit=dict(action='edit',id=original['id'],revision=original['revision'],completionRevision=original['completionRevision'],item=dict(original,completionMode='individual'))
        self.assertEqual((await self.write(edit))[0],409)
        current=(await self.items())[0];edit['completionRevision']=current['completionRevision']
        self.assertEqual((await self.write(edit))[0],200)
        individual=(await self.items())[0]
        self.assertFalse(individual['done']);self.assertTrue(all(not p['done'] for p in individual['personProgress']))
        await self.mark_person(individual,'tina')
        current=(await self.items())[0]
        to_shared=dict(action='edit',id=current['id'],revision=current['revision'],item=dict(current,completionMode='shared'))
        self.assertEqual((await self.write(to_shared))[0],409)
        to_shared['completionRevision']=current['completionRevision']
        self.assertEqual((await self.write(to_shared))[0],200)
        saved=(await self.items())[0];self.assertEqual(saved['completionMode'],'shared');self.assertFalse(saved['done'])
        self.assertEqual(saved['personProgress'],[])
        self.assertEqual((await self.mark(saved))[0],200)
        self.assertEqual(self.app['db'].execute('SELECT count(*) FROM family_person_checks').fetchone()[0],0)

    async def test_destructive_changes_protect_progress_on_other_days(self):
        start=self.day-timedelta(days=7)
        await self.write(dict(action='create',item=self.individual(dict(self.task(),weekdays=list(range(7)),startDate=start.isoformat()))))
        original=(await self.items())[0]
        yesterday=self.day-timedelta(days=1)
        await self.mark_person((await self.items(yesterday))[0],'tina',day=yesterday)
        edit=dict(action='edit',id=original['id'],revision=original['revision'],completionRevision=original['completionRevision'],item=dict(original,completionMode='shared'))
        self.assertEqual((await self.write(edit))[0],409,'Hidden earlier-day checkmarks must not be discarded silently')
        self.assertTrue((await self.items(yesterday))[0]['personProgress'][0]['done'])

    async def test_legacy_edit_preserves_personal_mode_and_selected_people(self):
        await self.write(dict(action='create',item=self.individual()))
        original=(await self.items())[0];await self.mark_person(original,'tina')
        old_client=dict(original);del old_client['completionMode'];del old_client['assignees'];old_client['title']='Umbenannt'
        self.assertEqual((await self.write(dict(action='edit',id=original['id'],revision=original['revision'],item=old_client)))[0],200)
        saved=(await self.items())[0]
        self.assertEqual(saved['completionMode'],'individual');self.assertEqual(saved['assignees'],['tina','joern']);self.assertTrue(saved['personProgress'][0]['done'])

    async def test_personal_progress_survives_restart_and_removal_cleans_it_up(self):
        self.app['db'].close()
        with tempfile.TemporaryDirectory() as root:
            path=str(Path(root)/'family.sqlite')
            self.app=make_app(AsyncMock(),path)
            await self.write(dict(action='create',item=self.individual()))
            item=(await self.items())[0];await self.mark_person(item,'tina')
            self.app['db'].close();self.app=make_app(AsyncMock(),path)
            saved=(await self.items())[0];self.assertTrue(saved['personProgress'][0]['done']);self.assertFalse(saved['personProgress'][1]['done'])
            self.assertEqual((await self.write(dict(action='remove',id=saved['id'],revision=saved['revision'])))[0],200)
            self.assertEqual(self.app['db'].execute('SELECT count(*) FROM family_person_checks').fetchone()[0],0)

    async def test_legacy_records_keep_their_existing_shared_checkmarks(self):
        legacy=definition(self.task());del legacy['completionMode'];del legacy['assignees']
        self.app['db'].execute('INSERT INTO family_items VALUES (?,?,1,?)',('before-update',json.dumps(legacy),'old'))
        self.app['db'].execute('INSERT INTO family_checks VALUES (?,?,?,?)',('before-update','once','task','old'));self.app['db'].commit()
        saved=(await self.items())[0]
        self.assertEqual(saved['completionMode'],'shared');self.assertTrue(saved['done']);self.assertEqual(saved['personProgress'],[])
        for invalid in (None,False,[],{},'everyone','per-person'):
            with self.assertRaises(ValueError):definition(dict(self.task(),completionMode=invalid))

if __name__ == '__main__':
    unittest.main()
