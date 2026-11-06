import json
import unittest
from unittest.mock import AsyncMock
from aiohttp.test_utils import make_mocked_request
from server import make_app, SOURCES, normalize_event
from datetime import date
from weather import current_weather, daily_forecast, weather

class WeatherTests(unittest.TestCase):
    def test_missing_values_and_zero(self):
        r=current_weather({'state':'sunny','attributes':{'temperature':0,'humidity':0,'wind_speed':float('nan')}})
        self.assertEqual(r['temperature'],0);self.assertEqual(r['humidity'],0);self.assertIsNone(r['windSpeed'])
        with self.assertRaises(ValueError):current_weather({'state':'unavailable'})

    def test_forecast_berlin_date_and_exclusion(self):
        rows=[{'datetime':'2026-11-05T23:30:00Z','temperature':0,'templow':-2},
              {'datetime':'2026-11-04T00:00:00Z','temperature':4},
              {'datetime':'bad'}, {'datetime':'2026-11-06T12:00:00Z'}]
        result=daily_forecast(rows,'2026-11-06')
        self.assertEqual(len(result),1);self.assertEqual(result[0]['date'],'2026-11-06');self.assertEqual(result[0]['high'],0)

    def test_birthdays_and_holidays_identity(self):
        for source in SOURCES[3:]:
            rows=normalize_event({'start':{'date':'2026-11-10'},'end':{'date':'2026-11-11'},'summary':'Test'},source,date(2026,11,1),date(2026,12,1))
            self.assertEqual(rows[0]['kind'],source['key']);self.assertTrue(rows[0]['readOnly']);self.assertTrue(rows[0]['allDay'])

class WeatherApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_current_survives_forecast_failure_and_caches(self):
        ha=AsyncMock();ha.request.return_value={'state':'cloudy','attributes':{'temperature':6,'supported_features':1}}
        ha.service.side_effect=TimeoutError()
        app=make_app(ha,':memory:',options={'weather_entity':'weather.home'})
        req=make_mocked_request('GET','/api/weather',app=app)
        for _ in range(2):
            response=await weather(req);self.assertEqual(response.status,200)
            data=json.loads(response.text);self.assertEqual(data['temperature'],6);self.assertTrue(data['forecastError'])
        self.assertEqual(ha.request.await_count,1);self.assertEqual(ha.service.await_count,1)
        self.assertEqual(len(app['sources']),5);app['db'].close()

    async def test_unavailable_current_is_not_empty_success(self):
        ha=AsyncMock();ha.request.return_value={'state':'unavailable'}
        app=make_app(ha,':memory:')
        req=make_mocked_request('GET','/api/weather',app=app)
        self.assertEqual((await weather(req)).status,502);app['db'].close()

if __name__=='__main__':unittest.main()
