"""Optional direct Google Calendar client. Credentials never leave the server."""
import asyncio
import re
import time
from pathlib import Path
from urllib.parse import quote

import yaml
from aiohttp import ClientError, ClientSession, ClientTimeout

SECRET_FILE = Path('/homeassistant/secrets.yaml')
SECRET_NAMES = ('familienkueche_google_client_id', 'familienkueche_google_client_secret',
                'familienkueche_google_refresh_token')
API = 'https://www.googleapis.com/calendar/v3/'
TOKEN_URL = 'https://oauth2.googleapis.com/token'
SCOPES = ('https://www.googleapis.com/auth/calendar.events.owned',
          'https://www.googleapis.com/auth/calendar.calendarlist.readonly')


class GoogleError(Exception):
    def __init__(self, message, status=502, uncertain=False):
        super().__init__(message)
        self.status, self.uncertain = status, uncertain


def read_credentials(path=SECRET_FILE):
    try:
        with path.open('rb') as stream:
            raw = stream.read(1_000_001)
        if len(raw) > 1_000_000:
            return None
        values = yaml.safe_load(raw)
        items = [values.get(k) for k in SECRET_NAMES] if isinstance(values, dict) else []
        if len(items) != 3 or not all(isinstance(v, str) and 8 <= len(v) <= 4096 and not re.search(r'\s', v) for v in items):
            return None
        if not re.fullmatch(r'[A-Za-z0-9_-]+\.apps\.googleusercontent\.com', items[0]):
            return None
        return dict(zip(('client_id', 'client_secret', 'refresh_token'), items))
    except (OSError, ValueError, yaml.YAMLError):
        # Parser exceptions can include secret values. Never return or log them.
        return None


class GoogleCalendar:
    def __init__(self, options):
        self.enabled = options.get('google_calendar_edit_enabled') is True
        self.calendar = options.get('google_calendar_edit_id') or 'primary'
        if not isinstance(self.calendar, str) or not 1 <= len(self.calendar) <= 250 or re.search(r'[\s/\\?#]', self.calendar):
            raise ValueError('Ungültige Google-Kalender-ID.')
        self.session = None
        self.token, self.expires = '', 0
        self.auth_lock = asyncio.Lock()

    def status(self):
        return {'enabled': self.enabled, 'configured': self.enabled and read_credentials() is not None,
                'calendarId': self.calendar, 'scopes': list(SCOPES)}

    async def close(self):
        if self.session:
            await self.session.close()

    async def _session(self):
        if self.session is None:
            # No Supervisor or OpenAI headers; redirects must never receive bearer credentials.
            self.session = ClientSession(timeout=ClientTimeout(total=12), trust_env=True)
        return self.session

    async def _json(self, response):
        data = bytearray()
        async for chunk in response.content.iter_chunked(65536):
            data.extend(chunk)
            if len(data) > 2_000_000:
                raise ValueError('Oversized response')
        import json
        result = json.loads(data)
        if not isinstance(result, dict):
            raise ValueError('Invalid response')
        return result

    async def _access_token(self):
        if not self.enabled:
            raise GoogleError('Direktes Bearbeiten ist noch nicht eingerichtet.', 503)
        async with self.auth_lock:
            if self.token and time.monotonic() < self.expires:
                return self.token
            credentials = read_credentials()
            if not credentials:
                raise GoogleError('Google-Zugang in secrets.yaml fehlt oder ist ungültig.', 503)
            try:
                session = await self._session()
                async with session.post(TOKEN_URL, data={**credentials, 'grant_type': 'refresh_token'}, allow_redirects=False) as response:
                    if response.status != 200:
                        raise GoogleError('Google-Freigabe konnte nicht erneuert werden. Zugang und Berechtigungen prüfen.', 503)
                    data = await self._json(response)
                token, expires = data.get('access_token'), data.get('expires_in')
                if not isinstance(token, str) or not 10 <= len(token) <= 8192 or re.search(r'[\r\n]', token) or not isinstance(expires, (int, float)) or expires < 60:
                    raise ValueError('Invalid token response')
                self.token, self.expires = token, time.monotonic() + min(expires - 30, 3500)
                return token
            except (ClientError, OSError, asyncio.TimeoutError, ValueError):
                raise GoogleError('Google-Anmeldung momentan nicht erreichbar. Es wurde kein Termin geändert.', 503) from None

    async def request(self, method, path, *, params=None, body=None, etag=None):
        token = await self._access_token()
        headers = {'Authorization': 'Bearer ' + token}
        if etag:
            headers['If-Match'] = etag
        try:
            session = await self._session()
            async with session.request(method, API + path, params=params, json=body,
                                       headers=headers, allow_redirects=False) as response:
                status = response.status
                if status in (401, 403):
                    self.token, self.expires = '', 0
                    raise GoogleError('Google-Berechtigung fehlt oder ist abgelaufen. Freigabe für den Kalender prüfen.', 403)
                if status in (404, 410, 412):
                    raise GoogleError('Der Termin wurde inzwischen geändert oder entfernt. Bitte neu öffnen.', 409)
                if status == 429:
                    raise GoogleError('Google begrenzt gerade die Anfragen. Bitte später erneut versuchen.', 429)
                if status < 200 or status >= 300:
                    raise GoogleError('Google konnte die Änderung nicht bestätigen.' if method == 'PATCH' else 'Google-Kalender konnte nicht geladen werden.',
                                      502, uncertain=method == 'PATCH' and (status == 408 or status >= 500 or 300 <= status < 400))
                return await self._json(response)
        except (ClientError, OSError, asyncio.TimeoutError, ValueError):
            raise GoogleError('Keine sichere Google-Bestätigung. Kalender prüfen und den Termin neu öffnen.' if method == 'PATCH' else 'Google-Kalender momentan nicht erreichbar.',
                              502, uncertain=method == 'PATCH') from None

    def path(self, suffix):
        return 'calendars/' + quote(self.calendar, safe='') + '/' + suffix

    async def info(self):
        info = await self.request('GET', 'users/me/calendarList/' + quote(self.calendar, safe=''))
        if info.get('accessRole') != 'owner' or not isinstance(info.get('id'), str):
            raise GoogleError('Diese Anbindung benötigt einen eigenen Google-Kalender. Gewählten Kalender und Google-Konto prüfen.', 403)
        return {'id': info['id'], 'name': str(info.get('summary') or 'Google-Kalender')[:250]}

    async def events(self, params):
        rows, page = [], None
        for _ in range(3):
            data = await self.request('GET', self.path('events'), params={**params, 'maxResults': 2500, **({'pageToken': page} if page else {})})
            items = data.get('items')
            if not isinstance(items, list):
                raise GoogleError('Ungültige Google-Kalenderantwort.')
            rows.extend(items)
            page = data.get('nextPageToken')
            if not page:
                return rows
        raise GoogleError('Zu viele Termine für diesen Zeitraum. Bitte einen kürzeren Termin wählen.', 409)

    async def get(self, event_id):
        return await self.request('GET', self.path('events/' + quote(event_id, safe='')))

    async def patch(self, event_id, body, etag):
        # Do not add/remove attendees, reminders or conference data, or emit invitation emails.
        return await self.request('PATCH', self.path('events/' + quote(event_id, safe='')),
                                  params={'sendUpdates': 'none'}, body=body, etag=etag)
