import base64
import io
import json
import unittest
from unittest.mock import AsyncMock
from aiohttp.test_utils import make_mocked_request
from PIL import Image
from server import make_app
from photos import normalize, listing, write, image


class PhotoTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.app = make_app(AsyncMock(), ':memory:')
        self.counter = 0

    async def asyncTearDown(self):
        self.app['db'].close()

    def photo(self, color='red'):
        out = io.BytesIO()
        img = Image.new('RGB', (2300, 1400), color)
        exif = Image.Exif()
        exif[270] = 'Private camera note'
        exif[274] = 6
        img.save(out, 'JPEG', exif=exif)
        return out.getvalue()

    async def call(self, data, key=None):
        self.counter += 1
        req = make_mocked_request('POST', '/api/saver/photos', app=self.app,
                                 headers={'Idempotency-Key': key or 'photo-test-request-%03d' % self.counter})
        req.json = AsyncMock(return_value=data)
        return await write(req)

    async def test_normalization_orientation_size_metadata_and_safe_format(self):
        raw, width, height = normalize(self.photo())
        self.assertLessEqual(width, 1920)
        self.assertLessEqual(height, 1080)
        self.assertLess(width, height, 'Camera rotation applied')
        saved = Image.open(io.BytesIO(raw))
        self.assertEqual(saved.format, 'JPEG')
        self.assertFalse(saved.getexif())
        self.assertNotIn(b'Private camera note', raw)
        for raw in [b'<svg onload="bad()"></svg>', b'not an image', b'x' * 2_000_001]:
            with self.assertRaises(ValueError):
                normalize(raw)

    async def test_upload_dedup_ingress_url_and_delete(self):
        data = dict(action='add', name='Familie', image=base64.b64encode(self.photo()).decode())
        for key in ['photo-shared-request-123', 'photo-shared-request-123', 'photo-other-request-123']:
            self.assertEqual((await self.call(data, key)).status, 200)
        req = make_mocked_request('GET', '/api/saver/photos', app=self.app)
        photos = json.loads((await listing(req)).text)['photos']
        self.assertEqual(len(photos), 1)
        self.assertTrue(photos[0]['url'].startswith('api/saver/photos/'))
        image_req = make_mocked_request('GET', '/', match_info={'id': photos[0]['id']}, app=self.app)
        result = await image(image_req)
        self.assertEqual(result.content_type, 'image/jpeg')
        self.assertTrue(result.body.startswith(b'\xff\xd8'))
        self.assertEqual((await self.call(dict(action='remove', id=photos[0]['id']))).status, 200)
        self.assertFalse(json.loads((await listing(req)).text)['photos'])
        self.app['ha'].request.assert_not_called()

    async def test_invalid_payload_and_limit(self):
        for payload in [dict(action='add', name='bad', image='%%'), dict(action='add', name='bad', image='A' * 2_700_001), dict(action='remove', id=[]), []]:
            self.assertEqual((await self.call(payload)).status, 400)
        for i in range(20):
            self.app['db'].execute('INSERT INTO family_photos VALUES (?, ?, ?, ?, ?, ?, ?)', (str(i), 'test', 1, 1, str(i), b'x', '2026'))
        self.app['db'].commit()
        self.assertEqual((await self.call(dict(action='add', name='Too many', image=base64.b64encode(self.photo()).decode()))).status, 400)

if __name__ == '__main__':
    unittest.main()
