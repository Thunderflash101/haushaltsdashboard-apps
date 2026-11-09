"""Bounded original-recipe photo cache. No credentials, user URLs or image generation."""
import asyncio
import hashlib
import io
import json
import time
import warnings
from html.parser import HTMLParser
from urllib.parse import urlsplit

from aiohttp import ClientSession, ClientTimeout, web
from PIL import Image, ImageOps


class Metadata(HTMLParser):
    def __init__(self):
        super().__init__(); self.urls = []; self.ld = False; self.parts = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'meta' and values.get('property') in ('og:image:secure_url', 'og:image'):
            self.urls.append(values.get('content', ''))
        if tag == 'script' and values.get('type') == 'application/ld+json':
            self.ld = True; self.parts = []

    def handle_data(self, value):
        if self.ld: self.parts.append(value)

    def handle_endtag(self, tag):
        if tag != 'script' or not self.ld: return
        self.ld = False
        try:
            data = json.loads(''.join(self.parts))
            def walk(value):
                if isinstance(value, list):
                    for item in value: walk(item)
                elif isinstance(value, dict):
                    if value.get('@type') == 'Recipe' or 'Recipe' in (value.get('@type') or []):
                        images = value.get('image', [])
                        for image in images if isinstance(images, list) else [images]:
                            self.urls.append(image.get('url', '') if isinstance(image, dict) else image)
                    walk(value.get('@graph', []))
            walk(data)
        except (ValueError, TypeError): pass


def original_image(html, recipe_url):
    parser = Metadata(); parser.feed(html)
    rid = recipe_url.split('/')[4]
    for candidate in parser.urls:
        if not isinstance(candidate, str) or len(candidate) > 2000: continue
        try: url = urlsplit(candidate)
        except ValueError: continue
        if (url.scheme == 'https' and url.netloc == 'img.chefkoch-cdn.de'
                and url.path.startswith('/rezepte/' + rid + '/bilder/') and not url.query and not url.fragment):
            return candidate
    return None


def thumbnail(raw):
    with warnings.catch_warnings():
        warnings.simplefilter('error', Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(raw)) as original:
            if original.format not in ('JPEG', 'PNG', 'WEBP') or original.width*original.height > 24_000_000:
                raise ValueError('Unsupported photo')
            original.load(); image = ImageOps.exif_transpose(original).convert('RGB')
            image.thumbnail((800, 500))
            output = io.BytesIO(); image.save(output, 'JPEG', quality=82)
            return output.getvalue()


async def bounded(response, limit):
    data = bytearray()
    async for chunk in response.content.iter_chunked(65536):
        data.extend(chunk)
        if len(data) > limit: raise ValueError('Response too large')
    return bytes(data)


async def fetch_photo(url):
    from meal_ai import recipe_url
    if recipe_url(url) != url: raise ValueError('Invalid recipe')
    async with ClientSession(timeout=ClientTimeout(total=15), trust_env=True, headers={'User-Agent': 'Familienkueche recipe preview'}) as session:
        async with session.get(url, allow_redirects=False) as response:
            if response.status != 200 or response.content_type != 'text/html': raise ValueError('No recipe page')
            html = (await bounded(response, 2_000_000)).decode('utf-8', errors='replace')
        photo = original_image(html, url)
        if not photo: raise ValueError('No original photo')
        async with session.get(photo, allow_redirects=False) as response:
            if response.status != 200 or response.content_type not in ('image/jpeg', 'image/png', 'image/webp'):
                raise ValueError('No photo')
            raw = await bounded(response, 4_000_000)
    return await asyncio.to_thread(thumbnail, raw)


def decorate(app, result):
    if not result: return result
    result = json.loads(json.dumps(result))
    from meal_ai import recipe_url
    db = app['db']
    protected = []
    for recipe in result.get('recipes', []) + result.get('alternatives', []):
        url = recipe_url(recipe.get('url'))
        if not url: continue
        ident = hashlib.sha256(url.encode()).hexdigest()
        protected.append(ident)
        db.execute('INSERT OR IGNORE INTO meal_images VALUES (?, ?, 0, NULL)', (ident, url))
        recipe['image'] = 'api/meal-ai/images/' + ident + '.jpg'
    if protected:
        placeholders = ','.join('?' for _ in protected)
        db.execute(f'DELETE FROM meal_images WHERE id NOT IN ({placeholders}) AND id NOT IN (SELECT id FROM meal_images ORDER BY updated DESC, rowid DESC LIMIT 160)', protected)
    db.commit()
    return result


async def image(request):
    app, ident = request.app, request.match_info['ident']
    db = app['db']
    row = db.execute('SELECT url, updated, image FROM meal_images WHERE id=?', (ident,)).fetchone()
    if not row: raise web.HTTPNotFound()
    if time.time()-row[1] >= (7*86400 if row[2] else 3600):
        async with app['meal_image_locks'].setdefault(ident, asyncio.Lock()), app['meal_image_slots']:
            row = db.execute('SELECT url, updated, image FROM meal_images WHERE id=?', (ident,)).fetchone()
            if not row: raise web.HTTPNotFound()
            if time.time()-row[1] >= (7*86400 if row[2] else 3600):
                try: photo = await app['meal_image_fetch'](row[0])
                except Exception: photo = row[2]
                with db:
                    db.execute('UPDATE meal_images SET updated=?, image=? WHERE id=?', (time.time(), photo, ident))
                row = (row[0], time.time(), photo)
    if not row[2]: raise web.HTTPNotFound()
    return web.Response(body=row[2], content_type='image/jpeg')


def setup(app):
    app['db'].execute('CREATE TABLE IF NOT EXISTS meal_images (id TEXT PRIMARY KEY, url TEXT, updated REAL, image BLOB)')
    app['db'].commit()
    app['meal_image_fetch'], app['meal_image_slots'] = fetch_photo, asyncio.Semaphore(2)
    app['meal_image_locks'] = {}
    app.router.add_get('/api/meal-ai/images/{ident:[a-f0-9]{64}}.jpg', image)
