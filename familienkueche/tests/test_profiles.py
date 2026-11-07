import base64
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock

from aiohttp import web
from aiohttp.test_utils import make_mocked_request
from PIL import Image

from server import make_app
from profiles import DEFAULTS, avatar, listing, image, snapshot, write


class ProfileTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.app = make_app(AsyncMock(), ':memory:')
        self.counter = 0

    async def asyncTearDown(self):
        self.app['db'].close()

    def photo(self, color='red'):
        out = io.BytesIO()
        source = Image.new('RGB', (700, 1000), color)
        exif = Image.Exif()
        exif[270] = 'Private camera details'
        exif[274] = 6
        source.save(out, 'JPEG', exif=exif)
        return base64.b64encode(out.getvalue()).decode()

    async def call(self, payload, key=None):
        self.counter += 1
        req = make_mocked_request('POST', '/api/profiles', app=self.app,
                                 headers={'Idempotency-Key': key or 'profile-test-request-%03d' % self.counter})
        req.json = AsyncMock(return_value=payload)
        return await write(req)

    def profile(self, person='tina'):
        return next(x for x in snapshot(self.app)['profiles'] if x['person'] == person)

    async def test_defaults_shared_color_revision_and_no_ha_mutation(self):
        req = make_mocked_request('GET', '/api/profiles', app=self.app)
        result = await listing(req)
        self.assertEqual(result.headers['Cache-Control'], 'no-store')
        self.assertEqual(len(json.loads(result.text)['profiles']), 4)
        data = dict(action='color', person='tina', revision=1, color='#1188AA')
        result = await self.call(data)
        self.assertEqual(result.status, 200)
        self.assertEqual(self.profile()['color'], '#1188aa')
        self.assertEqual(self.profile()['revision'], 2)
        self.app['ha'].request.assert_not_called()

    async def test_conflict_and_idempotence_do_not_overwrite_newer_edit(self):
        data = dict(action='color', person='tina', revision=1, color='#334455')
        key = 'profile-idempotent-12345'
        self.assertEqual((await self.call(data, key)).status, 200)
        self.assertEqual((await self.call(data, key)).status, 200)
        self.assertEqual(self.profile()['revision'], 2)
        self.assertEqual((await self.call(dict(data, color='#111111'))).status, 409)
        self.assertEqual((await self.call(dict(data, color='#111111'), key)).status, 409)
        self.assertEqual((await self.call(dict(data, color='#222222', revision=2))).status, 200)
        self.assertEqual((await self.call(data, key)).status, 200)
        self.assertEqual(self.profile()['color'], '#222222')
        self.assertEqual(self.profile()['revision'], 3)

    async def test_avatar_normalization_url_replacement_and_album_separation(self):
        result = await self.call(dict(action='photo', person='tina', revision=1, image=self.photo()))
        self.assertEqual(result.status, 200)
        first = self.profile()
        self.assertRegex(first['photo'], r'^api/profiles/tina/photo/[a-f0-9]{64}\.jpg$')
        self.assertEqual(self.app['db'].execute('SELECT count(*) FROM family_photos').fetchone()[0], 0)
        req = make_mocked_request('GET', '/', app=self.app,
                                  match_info={'person': 'tina', 'digest': first['photo'].split('/')[-1][:-4]})
        saved = await image(req)
        photo = Image.open(io.BytesIO(saved.body))
        self.assertEqual(photo.size, (320, 320))
        self.assertFalse(photo.getexif())
        self.assertNotIn(b'Private camera details', saved.body)
        self.assertEqual(saved.content_type, 'image/jpeg')
        self.assertTrue(saved.headers['Cache-Control'].startswith('private'))
        self.assertEqual((await self.call(dict(action='photo', person='tina', revision=2, image=self.photo('blue')))).status, 200)
        self.assertNotEqual(self.profile()['photo'], first['photo'])
        with self.assertRaises(web.HTTPNotFound):
            await image(req)
        self.assertEqual((await self.call(dict(action='remove-photo', person='tina', revision=3))).status, 200)
        self.assertIsNone(self.profile()['photo'])
        self.assertEqual(self.profile()['color'], DEFAULTS['tina'])

    async def test_validation_and_failed_avatar_preserve_profile(self):
        original = self.profile()
        for patch in [dict(person=[]), dict(person='stranger'), dict(color='red;display:none'),
                      dict(revision=True), dict(revision=0), dict(action='bad'),
                      dict(action='photo', image='%%%'), dict(action='photo', image='A' * 2_700_001),
                      dict(action='photo', image=base64.b64encode(b'<svg></svg>').decode()),
                      dict(person='alle', action='photo', image=self.photo())]:
            self.assertEqual((await self.call(dict(dict(action='color', person='tina', revision=1, color='#334455'), **patch))).status, 400)
        self.assertEqual((await self.call([])).status, 400)
        self.assertEqual(self.profile(), original)
        for bad in [b'x' * 2_000_001, b'not a photo']:
            with self.assertRaises(ValueError):
                avatar(bad)

    async def test_profiles_survive_restart_and_defaults_never_reset_them(self):
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory) / 'test.sqlite')
            old_app = self.app
            self.app = make_app(AsyncMock(), path)
            await self.call(dict(action='color', person='felix', revision=1, color='#123456'))
            await self.call(dict(action='photo', person='felix', revision=2, image=self.photo()))
            saved = self.profile('felix')
            self.app['db'].close()
            self.app = make_app(AsyncMock(), path)
            self.assertEqual(self.profile('felix'), saved)
            self.app['db'].close()
            self.app = old_app


if __name__ == '__main__':
    unittest.main()
