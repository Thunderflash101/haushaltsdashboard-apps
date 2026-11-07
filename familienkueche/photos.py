"""Private family photos. Only normalized JPEGs are stored and served via ingress."""
import asyncio
import base64
import binascii
import hashlib
import io
import json
import uuid
import warnings
from datetime import datetime

from aiohttp import web
from PIL import Image, ImageOps, UnidentifiedImageError

from family import receipt_key, saved_response, save_response, text
from server import TZ


def normalize(raw):
    if not 0 < len(raw) <= 2_000_000:
        raise ValueError('Das Foto ist zu groß. Bitte ein kleineres Bild wählen.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as original:
                if original.format not in ('JPEG', 'PNG', 'WEBP') or getattr(original, 'n_frames', 1) != 1:
                    raise ValueError('Bitte ein einzelnes JPEG-, PNG- oder WebP-Foto wählen.')
                if original.width * original.height > 24_000_000:
                    raise ValueError('Bitte ein Foto mit höchstens 24 Megapixeln wählen.')
                original.load()
                image = ImageOps.exif_transpose(original)
                image.thumbnail((1920, 1080))
                if image.mode != 'RGB':
                    if 'A' in image.getbands() or image.mode == 'P':
                        rgba = image.convert('RGBA')
                        image = Image.new('RGB', rgba.size, '#f3eae1')
                        image.paste(rgba, mask=rgba.getchannel('A'))
                    else:
                        image = image.convert('RGB')
                out = io.BytesIO()
                image.save(out, 'JPEG', quality=82)
                return out.getvalue(), image.width, image.height
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError('Dieses Foto konnte nicht gelesen werden.') from exc


async def listing(request):
    rows = request.app['db'].execute('SELECT id, name, width, height FROM family_photos ORDER BY created, id').fetchall()
    return web.json_response({'photos': [dict(id=r[0], name=r[1], width=r[2], height=r[3], url='api/saver/photos/' + r[0] + '.jpg') for r in rows], 'limit': 20})


async def image(request):
    ident = request.match_info['id']
    row = request.app['db'].execute('SELECT image FROM family_photos WHERE id=?', (ident,)).fetchone()
    if not row:
        raise web.HTTPNotFound()
    return web.Response(body=row[0], content_type='image/jpeg')


async def write(request):
    try:
        data = await request.json()
        if not isinstance(data, dict) or data.get('action') not in ('add', 'remove'):
            raise ValueError('Ungültige Fotoaktion.')
        key = receipt_key(request, 'photo')
        digest = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
        action = data['action']
        if action == 'add':
            name = text(data.get('name'), 80)
            encoded = data.get('image')
            if not isinstance(encoded, str) or len(encoded) > 2_700_000:
                raise ValueError('Das Foto ist zu groß.')
            try:
                raw = base64.b64decode(encoded, validate=True)
            except (ValueError, binascii.Error) as exc:
                raise ValueError('Ungültige Fotodatei.') from exc
            async with request.app['photo_lock']:
                photo, width, height = await asyncio.to_thread(normalize, raw)
            content_hash = hashlib.sha256(photo).hexdigest()
        elif not isinstance(data.get('id'), str):
            raise ValueError('Ungültiges Foto.')
    except (ValueError, TypeError) as exc:
        return web.json_response({'error': str(exc)}, status=400)
    async with request.app['write_lock']:
        db = request.app['db']
        saved = saved_response(db, key, digest)
        if saved is not None:
            return saved
        if action == 'add':
            existing = db.execute('SELECT id FROM family_photos WHERE digest=?', (content_hash,)).fetchone()
            if not existing and db.execute('SELECT count(*) FROM family_photos').fetchone()[0] >= 20:
                return web.json_response({'error': 'Es sind bereits 20 Fotos vorhanden. Bitte zuerst eines entfernen.'}, status=400)
            ident = existing[0] if existing else uuid.uuid4().hex
        with db:
            if action == 'add':
                if not existing:
                    db.execute('INSERT INTO family_photos VALUES (?, ?, ?, ?, ?, ?, ?)',
                               (ident, name, width, height, content_hash, photo, datetime.now(TZ).isoformat()))
            else:
                db.execute('DELETE FROM family_photos WHERE id=?', (data['id'],))
            result = {'success': True}
            save_response(db, key, digest, result)
        return web.json_response(result)


def setup(app):
    app['db'].execute('CREATE TABLE IF NOT EXISTS family_photos (id TEXT PRIMARY KEY, name TEXT, width INTEGER, height INTEGER, digest TEXT UNIQUE, image BLOB, created TEXT)')
    app['db'].commit()
    app['photo_lock'] = asyncio.Lock()
    app.router.add_get('/api/saver/photos', listing)
    app.router.add_get('/api/saver/photos/{id:[a-f0-9]{32}}.jpg', image)
    app.router.add_post('/api/saver/photos', write)
