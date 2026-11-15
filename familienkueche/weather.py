"""Bounded current weather plus daily and hourly forecasts through Home Assistant."""
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


def hourly_forecast(raw, now):
    result = []
    seen = set()
    if now.tzinfo is None:
        now = now.replace(tzinfo=TZ)
    now_timestamp = now.timestamp()
    for entry in raw:
        try:
            stamp = datetime.fromisoformat(entry['datetime'].replace('Z', '+00:00'))
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=TZ)
            stamp = stamp.astimezone(TZ)
            timestamp = stamp.timestamp()
            if timestamp <= now_timestamp or timestamp in seen:
                continue
            seen.add(timestamp)
            result.append((timestamp, {'datetime': stamp.isoformat(), 'condition': str(entry.get('condition') or ''),
                                       'temperature': number(entry.get('temperature')),
                                       'rainChance': number(entry.get('precipitation_probability'))}))
        except (KeyError, ValueError, TypeError, OverflowError):
            continue
    return [item for _, item in sorted(result, key=lambda row: row[0])[:12]]


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
        result.update(forecast=[], forecastError=None, hourlyForecast=[], hourlyForecastError=None,
                      fetchedAt=datetime.now(TZ).isoformat())
        features = int(raw.get('attributes', {}).get('supported_features') or 0)
        today = datetime.now(TZ).date().isoformat()

        async def get_forecast(kind, enabled, parse, unsupported):
            if not enabled:
                return [], unsupported
            try:
                data = await app['ha'].service('weather', 'get_forecasts',
                                               {'entity_id': app['weather_entity'], 'type': kind}, response=True)
                forecast = data[app['weather_entity']]['forecast']
                if not isinstance(forecast, list):
                    raise ValueError('Forecast response is missing a list.')
                return parse(forecast), None
            except Exception:
                message = 'Stundenprognose momentan nicht verfügbar.' if kind == 'hourly' else 'Vorhersage momentan nicht verfügbar.'
                return [], message

        daily, hourly = await asyncio.gather(
            get_forecast('daily', bool(features & 1), lambda rows: daily_forecast(rows, today),
                         'Diese Wetterquelle bietet keine Tagesvorhersage.'),
            get_forecast('hourly', bool(features & 2), lambda rows: hourly_forecast(rows, datetime.now(TZ)),
                         'Diese Wetterquelle bietet keine stündliche Vorhersage.')
        )
        result['forecast'], result['forecastError'] = daily
        result['hourlyForecast'], result['hourlyForecastError'] = hourly
        app['weather_cache'] = (time.monotonic(), result)
        return web.json_response(result)


def setup(app, options):
    entity = options.get('weather_entity') or 'weather.home'
    if not re.fullmatch(r'weather\.[a-z0-9_]+', entity):
        raise ValueError('Ungültige Wetter-Entität in der App-Konfiguration.')
    app['weather_entity'], app['weather_cache'], app['weather_lock'] = entity, None, asyncio.Lock()
    app.router.add_get('/api/weather', weather)
