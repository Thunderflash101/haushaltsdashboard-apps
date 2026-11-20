"""Verify the optional management PIN at the actual write handlers."""
import unittest
from unittest.mock import AsyncMock, patch

from aiohttp.test_utils import make_mocked_request

import family
import rewards
from server import make_app


class ParentGuardTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.app = make_app(AsyncMock(), ':memory:', {'parent_pin': '01234'})
        self.addCleanup(self.app['db'].close)

    async def post(self, handler, action, pin=None):
        headers = {'Idempotency-Key': 'parent-test-request-key'}
        if pin is not None:
            headers['X-Family-Parent-PIN'] = pin
        req = make_mocked_request('POST', '/', app=self.app, headers=headers)
        req.json = AsyncMock(return_value={'action': action, 'title': 'Spiel', 'cost': 2})
        return await handler(req)

    async def test_all_management_actions_and_saved_receipt_require_pin(self):
        for handler, actions in ((family.write_item, ['create', 'edit', 'remove']),
                                 (rewards.write, ['create', 'edit', 'remove', 'reverse'])):
            for action in actions:
                with self.subTest(handler=handler, action=action):
                    self.assertEqual((await self.post(handler, action)).status, 403)
        self.assertEqual((await self.post(rewards.write, 'create', '01234')).status, 200)
        self.assertEqual((await self.post(rewards.write, 'create')).status, 403)
        self.assertEqual((await self.post(rewards.write, 'create', '01234')).status, 200)
        self.assertEqual(len(rewards.state(self.app)['rewards']), 1)

    async def test_cooldown_applies_across_protected_endpoints_and_expires(self):
        with patch('parent_guard.monotonic', return_value=100):
            for _ in range(4):
                self.assertEqual((await self.post(family.write_item, 'create', '1111')).status, 403)
            self.assertEqual((await self.post(rewards.write, 'create', '1111')).status, 429)
            self.assertEqual((await self.post(rewards.write, 'create', '01234')).status, 429)
        with patch('parent_guard.monotonic', return_value=161):
            self.assertEqual((await self.post(rewards.write, 'create', '01234')).status, 200)
