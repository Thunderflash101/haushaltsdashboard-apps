"""Optional household PIN for managing tasks, routines and rewards."""
import hmac
import re
from time import monotonic

from aiohttp import web


class ParentGuard:
    def __init__(self, pin):
        if not isinstance(pin, str) or (pin and not re.fullmatch(r'[0-9]{4,8}', pin)):
            raise ValueError('Die Eltern-PIN muss leer sein oder aus 4 bis 8 Ziffern bestehen.')
        self._pin = pin
        self._attempts = 0
        self._blocked_until = 0.0

    @property
    def enabled(self):
        return bool(self._pin)

    def check(self, request):
        if not self.enabled:
            return None
        if monotonic() < self._blocked_until:
            return web.json_response({'error': 'Zu viele PIN-Versuche. Bitte nach einer Minute erneut versuchen.'}, status=429)
        supplied = request.headers.get('X-Family-Parent-PIN', '')
        if not supplied:
            return web.json_response({'error': 'Zum Speichern die Eltern-PIN eingeben. Fehlt das Feld, die Ansicht neu laden.'}, status=403)
        if re.fullmatch(r'[0-9]{4,8}', supplied) and hmac.compare_digest(self._pin, supplied):
            self._attempts = 0
            return None
        self._attempts += 1
        if self._attempts >= 5:
            self._attempts = 0
            self._blocked_until = monotonic() + 60
            return web.json_response({'error': 'Zu viele PIN-Versuche. Bitte nach einer Minute erneut versuchen.'}, status=429)
        return web.json_response({'error': 'Die Eltern-PIN stimmt nicht.'}, status=403)
