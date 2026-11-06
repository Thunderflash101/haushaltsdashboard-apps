"""Bounded current weather and daily forecast through Home Assistant."""
import asyncio
import math
import re
import time
from datetime import datetime
from zoneinfo import ZoneInfo
from aiohttp import web

TZ = ZoneInfo('Europe/Berlin')

def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else None


def current_weather(raw):
    if raw.get('state') in (None, 'unavailable', 'unknown'):
        raise ValueError('Wetterquelle nicht verfügbar.')
    attrs = raw.get('attributes', {})
    return {'condition': str(raw['state']), 'temperature': number(attrs.get('temperature')),
            'temperatureUnit': str(attrs.get('temperature_unit') or '°C'),
            'humidity': number(attrs.get('humidity')), 'windSpeed': number(attrs.get('wind_speed')),
            'windUnit': str(attrs.get('wind_speed_unit') or ''),
            'source': str(attrs.get('friendly_name') or 'Wetter'), 'reportedAt': raw.get('last_updated')}


def daily_forecast(raw, today):
    result = []
    seen = set()
    for entry in raw:
        try:
            stamp = datetime.fromisoformat(entry['datetime'].replace('Z', '+00:00'))
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=TZ)
            day = stamp.astimezone(TZ).date().isoformat()
            if day < today or day in seen:
                continue
            seen.add(day)
            result.append({'date': day, 'condition': str(entry.get('condition') or ''),
                           'high': number(entry.get('temperature')), 'low': number(entry.get('templow')),
                           'rainChance': number(entry.get('precipitation_probability'))})
        except (KeyError, ValueError, TypeError):
            continue
    return sorted(result, key=lambda x: x['date'])[:5]


async def weather(request):
    app = request.app
    async with app['weather_lock']:
        cached = app['weather_cache']
        if cached and time.monotonic() - cached[0] < 300:
            return web.json_response(cached[1])
        try:
            raw = await app['ha'].request('GET', 'states/' + app['weather_entity'])
            result = current_weather(raw)
        except Exception:
            return web.json_response({'error': 'Wetter konnte nicht aus Home Assistant geladen werden.'}, status=502)
        result.update(forecast=[], forecastError=None, fetchedAt=datetime.now(TZ).isoformat())
        if int(raw.get('attributes', {}).get('supported_features') or 0) & 1:
            try:
                data = await app['ha'].service('weather', 'get_forecasts', {'entity_id': app['weather_entity'], 'type': 'daily'}, response=True)
                result['forecast'] = daily_forecast(data[app['weather_entity']]['forecast'], datetime.now(TZ).date().isoformat())
            except Exception:
                result['forecastError'] = 'Vorhersage momentan nicht verfügbar.'
        else:
            result['forecastError'] = 'Diese Wetterquelle bietet keine Tagesvorhersage.'
        app['weather_cache'] = (time.monotonic(), result)
        return web.json_response(result)


def setup(app, options):
    entity = options.get('weather_entity') or 'weather.home'
    if not re.fullmatch(r'weather\.[a-z0-9_]+', entity):
        raise ValueError('Ungültige Wetter-Entität in der App-Konfiguration.')
    app['weather_entity'], app['weather_cache'], app['weather_lock'] = entity, None, asyncio.Lock()
    app.router.add_get('/api/weather', weather)
