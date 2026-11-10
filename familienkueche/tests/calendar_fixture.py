"""Temporary loopback-only app with synthetic calendars; no real HA access."""
import asyncio
import json
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

from aiohttp import web

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import make_app, TZ


class FixtureHA:
    def __init__(self):
        self.day = datetime.now(TZ).date()
        self.writes = 0

    async def events(self, entity, start, end):
        def timed(uid, title, start_time, end_time, offset=0):
            day = (self.day + timedelta(days=offset)).isoformat()
            return dict(uid=uid, summary=title, start={'dateTime': day+'T'+start_time+':00+01:00'},
                        end={'dateTime': day+'T'+end_time+':00+01:00'}, location='Testpraxis Münster')
        if entity == 'calendar.tina':
            return [timed('arzt', 'Zahnarzt Kontrolle', '10:00', '11:00'),
                    timed('meeting', 'Elterngespräch', '10:30', '11:30'),
                    timed('adjacent', 'Anschließender Termin', '11:30', '12:00'),
                    timed('past', 'Zahnarzt vergangen', '09:00', '10:00', -45),
                    timed('future', 'Zahnarzt in drei Monaten', '09:00', '10:00', 80)]
        if entity == 'calendar.joern':
            return [timed('football', 'Fußball Jörn', '10:00', '11:00'),
                    timed('dentist', 'Zahnarzt Jörn', '12:00', '13:00')]
        return []

    async def features(self, entity):
        return 3

    async def create(self, *args, **kwargs):
        self.writes += 1
        raise RuntimeError('No writes in search fixture')

    async def service(self, *args, **kwargs):
        self.writes += 1
        raise RuntimeError('No writes in search fixture')

    async def request(self, *args, **kwargs):
        raise RuntimeError('No external requests in search fixture')


async def main():
    with tempfile.TemporaryDirectory(prefix='calendar-browser-') as root:
        fake = FixtureHA()
        app = make_app(fake, str(Path(root) / 'fixture.sqlite'))
        async def writes(request):
            return web.json_response({'writes': fake.writes})
        app.router.add_get('/fixture/writes', writes)
        app.middlewares.clear()
        runner = web.AppRunner(app, access_log=None)
        await runner.setup()
        site = web.TCPSite(runner, '127.0.0.1', 0)
        await site.start()
        print(json.dumps({'port':site._server.sockets[0].getsockname()[1], 'day':fake.day.isoformat()}), flush=True)
        try:
            await asyncio.Event().wait()
        finally:
            await runner.cleanup()


if __name__ == '__main__':
    asyncio.run(main())
