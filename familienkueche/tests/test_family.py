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

    async def test_validation_limits(self):
        for change in [dict(title=' '), dict(person='other'), dict(icon='javascript:bad'), dict(weekdays=[True]), dict(weekdays=[0, 0]), dict(startDate='2026-13-99')]:
            with self.assertRaises(ValueError):
                definition({**self.task(), **change})
        for change in [dict(weekdays=[]), dict(steps=[]), dict(steps=[dict(title='x', icon='check')] * 13)]:
            with self.assertRaises(ValueError):
                definition({**self.routine(), **change})
        req = make_mocked_request('GET', '/api/family?date=2001-01-01', app=self.app)
        self.assertEqual((await get_items(req)).status, 400)

if __name__ == '__main__':
    unittest.main()
