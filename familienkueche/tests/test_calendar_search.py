import asyncio
import json
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch

from aiohttp.test_utils import make_mocked_request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import calendar_search
from server import SOURCES, UpstreamError, make_app


def event(uid, day='2026-11-10', title='Zahnarzt', **extra):
    return dict(uid=uid, summary=title, start={'dateTime': day+'T10:00:00+01:00'},
                end={'dateTime': day+'T11:00:00+01:00'}, **extra)


class SearchTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.ha = AsyncMock()
        self.ha.events.return_value = []
        self.app = make_app(self.ha, ':memory:')

    def tearDown(self):
        self.app['db'].close()

    async def search(self, query='q=zahnarzt&start=2026-11-01&end=2026-12-01&person=alle'):
        response = await calendar_search.search(make_mocked_request('GET', '/api/calendar/search?'+query, app=self.app))
        return response.status, json.loads(response.text)

    async def test_validation_never_reads_invalid_requests(self):
        for query in ('q=a&start=2026-01-01&end=2026-01-02',
                      'q=ab&start=2026-01-01&end=2028-01-01',
                      'q=ab&start=2026-01-02&end=2026-01-01',
                      'q=ab&start=oops&end=2026-01-01',
                      'q=ab&start=2026-01-01&end=2026-01-02&person=unknown'):
            status, _ = await self.search(query)
            self.assertEqual(status, 400)
        self.ha.events.assert_not_awaited()

    async def test_person_fields_german_matching_and_no_feature_or_write_calls(self):
        self.ha.events.return_value = [event('a', title='Örtlicher Arzt', location='Münster', description='Jörns Kontrolle')]
        status, result = await self.search('q=JOERNS+MUENSTER&start=2026-11-01&end=2026-12-01&person=joern')
        self.assertEqual(status, 200)
        self.assertEqual(len(result['events']), 1)
        self.assertEqual(result['events'][0]['person'], 'joern')
        self.assertEqual(self.ha.events.call_args.args[0], SOURCES[1]['entity'])
        self.ha.features.assert_not_awaited()
        self.ha.create.assert_not_awaited()
        self.ha.service.assert_not_awaited()

    async def test_felix_without_calendar_has_no_false_results(self):
        _, result = await self.search('q=arzt&start=2026-11-01&end=2026-12-01&person=felix')
        self.assertEqual(result['total'], 0)
        self.assertEqual(result['sources'], [])
        self.ha.events.assert_not_awaited()

    async def test_year_chunking_and_multi_day_occurrence_deduplication(self):
        self.ha.events.return_value = [dict(uid='trip', summary='Familienurlaub', start={'date':'2026-03-01'}, end={'date':'2026-03-15'})]
        _, result = await self.search('q=urlaub&start=2026-01-01&end=2027-01-01&person=tina')
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['events'][0]['date'], '2026-03-01')
        self.assertEqual(self.ha.events.await_count, 6)
        self.assertTrue(all(0 < (c.args[2]-c.args[1]).days <= 63 for c in self.ha.events.call_args_list))
        self.assertTrue(all(s['ok'] for s in result['sources']))

    async def test_recurring_same_uid_keeps_distinct_dates(self):
        self.ha.events.return_value = [event('same', day='2026-11-10'), event('same', day='2026-11-17')]
        _, result = await self.search('q=arzt&start=2026-11-01&end=2026-12-01&person=tina')
        self.assertEqual(result['total'], 2)

    async def test_partial_sources_and_invalid_rows_are_visible(self):
        async def read(entity, start, end):
            if entity == SOURCES[0]['entity']:
                raise UpstreamError('private diagnostics must not escape')
            return [event('ok'), dict(summary='Malformed')]
        self.ha.events.side_effect = read
        _, result = await self.search()
        self.assertEqual(result['total'], 4)
        self.assertTrue(all(not s['ok'] and s['warning'] for s in result['sources']))
        self.assertNotIn('private diagnostics', json.dumps(result))

    async def test_result_cap_is_globally_chronological_even_with_unsorted_upstream(self):
        days=[(date(2026,1,1)+timedelta(days=i)).isoformat() for i in range(130)]
        self.ha.events.return_value = [event(str(i), day=day) for i, day in reversed(list(enumerate(days)))]
        _, result = await self.search('q=arzt&start=2026-01-01&end=2026-06-01&person=tina')
        self.assertEqual(result['total'], 130)
        self.assertTrue(result['truncated'])
        self.assertEqual(len(result['events']), 100)
        self.assertEqual(result['events'][0]['date'], days[0])
        self.assertEqual(result['events'][-1]['date'], days[99])

    async def test_timeouts_preserve_successful_windows(self):
        calls = 0
        async def read(entity, start, end):
            nonlocal calls
            calls += 1
            if calls > 1:
                await asyncio.sleep(1)
            return [event('a', day='2026-01-10')]
        self.ha.events.side_effect = read
        with patch.object(calendar_search, 'SOURCE_TIMEOUT', .02), patch.object(calendar_search, 'WINDOW_TIMEOUT', .01):
            _, result = await self.search('q=arzt&start=2026-01-01&end=2026-06-01&person=tina')
        self.assertEqual(result['total'], 1)
        self.assertFalse(result['sources'][0]['ok'])
        self.assertIn('Nicht alle', result['sources'][0]['warning'])

    async def test_concurrent_search_is_bounded(self):
        async with self.app['calendar_search_lock']:
            status, _ = await self.search()
        self.assertEqual(status, 429)
        self.ha.events.assert_not_awaited()

    async def test_raw_limit_is_reported_as_partial(self):
        self.ha.events.return_value = [event(str(i)) for i in range(10)]
        with patch.object(calendar_search, 'MAX_RAW', 3):
            _, result = await self.search('q=arzt&start=2026-11-01&end=2026-12-01&person=tina')
        self.assertEqual(result['total'], 3)
        self.assertFalse(result['sources'][0]['ok'])


if __name__ == '__main__':
    unittest.main()
