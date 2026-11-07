"""Shared family colours and private avatars, independent of the saver album."""
import asyncio
import base64
import binascii
import hashlib
import io
import json
import re

from aiohttp import web
from PIL import Image, ImageOps

from family import receipt_key, saved_response, save_response
from photos import normalize

DEFAULTS = {'alle': '#c58a53', 'tina': '#9b6cb1', 'joern': '#5082ba', 'felix': '#779447'}


def snapshot(app):
    return {'profiles': [dict(person=person, color=color, revision=revision,
                              photo='api/profiles/' + person + '/photo/' + digest + '.jpg' if digest else None)
                         for person, color, revision, digest in app['db'].execute(
                             'SELECT person, color, revision, digest FROM family_profiles ORDER BY person')]}


async def listing(request):
    return web.json_response(snapshot(request.app), headers={'Cache-Control': 'no-store'})


def avatar(raw):
    normalized, _, _ = normalize(raw)
    with Image.open(io.BytesIO(normalized)) as image:
        cropped = ImageOps.fit(image, (320, 320), method=Image.Resampling.LANCZOS)
        out = io.BytesIO()
        cropped.save(out, 'JPEG', quality=85)
        return out.getvalue()


async def image(request):
    row = request.app['db'].execute('SELECT image FROM family_profiles WHERE person=? AND digest=?',
                                    (request.match_info['person'], request.match_info['digest'])).fetchone()
    if not row or not row[0]:
        raise web.HTTPNotFound()
    return web.Response(body=row[0], content_type='image/jpeg',
                        headers={'Cache-Control': 'private, max-age=86400'})


async def write(request):
    try:
        data = await request.json()
        if not isinstance(data, dict) or data.get('person') not in DEFAULTS:
            raise ValueError('Bitte eine gültige Person wählen.')
        action, person = data.get('action'), data['person']
        if action not in ('color', 'photo', 'remove-photo'):
            raise ValueError('Ungültige Profilaktion.')
        if type(data.get('revision')) is not int or data['revision'] < 1:
            raise ValueError('Bitte das Profil zuerst aktualisieren.')
        key = receipt_key(request, 'profile')
        digest = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
        if action == 'color':
            color = data.get('color')
            if not isinstance(color, str) or not re.fullmatch(r'#[a-fA-F0-9]{6}', color):
                raise ValueError('Bitte eine gültige Farbe wählen.')
            color = color.lower()
        elif person == 'alle':
            raise ValueError('Bitte ein Foto für Tina, Jörn oder Felix wählen.')
        elif action == 'photo':
            encoded = data.get('image')
            if not isinstance(encoded, str) or len(encoded) > 2_700_000:
                raise ValueError('Das Foto ist zu groß.')
            try:
                raw = base64.b64decode(encoded, validate=True)
            except (ValueError, binascii.Error) as exc:
                raise ValueError('Ungültige Fotodatei.') from exc
            async with request.app['photo_lock']:
                photo = await asyncio.to_thread(avatar, raw)
            photo_digest = hashlib.sha256(photo).hexdigest()
    except (ValueError, TypeError) as exc:
        return web.json_response({'error': str(exc)}, status=400)
    async with request.app['write_lock']:
        db = request.app['db']
        saved = saved_response(db, key, digest)
        if saved is not None:
            return saved
        current = db.execute('SELECT revision FROM family_profiles WHERE person=?', (person,)).fetchone()
        if not current or current[0] != data['revision']:
            return web.json_response({'error': 'Das Profil wurde inzwischen geändert. Bitte aktualisieren und erneut prüfen.',
                                      'conflict': True}, status=409)
        with db:
            if action == 'color':
                db.execute('UPDATE family_profiles SET color=?, revision=revision+1 WHERE person=?', (color, person))
            elif action == 'photo':
                db.execute('UPDATE family_profiles SET image=?, digest=?, revision=revision+1 WHERE person=?',
                           (photo, photo_digest, person))
            else:
                db.execute('UPDATE family_profiles SET image=NULL, digest=NULL, revision=revision+1 WHERE person=?', (person,))
            result = dict(snapshot(request.app), success=True)
            save_response(db, key, digest, result)
        return web.json_response(result)


def setup(app):
    db = app['db']
    db.execute('CREATE TABLE IF NOT EXISTS family_profiles (person TEXT PRIMARY KEY, color TEXT, revision INTEGER, image BLOB, digest TEXT)')
    for person, color in DEFAULTS.items():
        db.execute('INSERT OR IGNORE INTO family_profiles VALUES (?, ?, 1, NULL, NULL)', (person, color))
    db.commit()
    app.router.add_get('/api/profiles', listing)
    app.router.add_post('/api/profiles', write)
    app.router.add_get('/api/profiles/{person:tina|joern|felix}/photo/{digest:[a-f0-9]{64}}.jpg', image)
