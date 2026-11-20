"""Loopback-only backend for browser tests; temporary DB, no HA connection."""
import os
import asyncio
import json
import tempfile
from pathlib import Path
import sys
from datetime import datetime, timedelta
from aiohttp import web

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import make_app, TZ

class FixtureHA:
    def __init__(self):
        self.started = datetime.now(TZ).replace(second=0, microsecond=0)
        self.sent = 0

    async def events(self, entity, start, end):
        if entity == 'calendar.waste':
            day = (self.started + timedelta(days=1)).date()
            return [dict(uid='fixture-waste', summary='Restmüll', start={'date': day.isoformat()}, end={'date': (day+timedelta(days=1)).isoformat()})]
        if entity in ('calendar.person_1', 'calendar.person_2'):
            begins = self.started + timedelta(minutes=20 if entity == 'calendar.person_1' else 120)
            finishes = begins + timedelta(hours=1)
            return [dict(uid=entity, summary='Arzttermin Person 1' if entity == 'calendar.person_1' else 'Fußball Person 2', start={'dateTime': begins.isoformat()}, end={'dateTime': finishes.isoformat()})]
        return []

    async def request(self, method, path, *args, **kwargs):
        if method == 'GET' and path == 'services':
            return [dict(domain='notify', services={'mobile_app_test_phone': {'name': 'Mobile App Test-Handy'}})]
        raise RuntimeError('Fixture request is not mocked')

    async def service(self, domain, name, payload, **kwargs):
        if domain != 'notify' or name != 'mobile_app_test_phone':
            raise RuntimeError('Fixture never contacts an actual service')
        self.sent += 1
        return []

async def main():
    with tempfile.TemporaryDirectory(prefix='family-browser-') as root:
        fake = FixtureHA()
        app = make_app(fake, str(Path(root) / 'fixture.sqlite'), options={'parent_pin':os.environ.get('FIXTURE_PARENT_PIN',''),'tina_calendar':'calendar.person_1','joern_calendar':'calendar.person_2','waste_calendar':'calendar.waste'})
        async def count(request):
            return web.json_response({'count': fake.sent})
        app.router.add_get('/fixture/notify-count', count)
        # Browser fixtures bind only to loopback. Production ingress middleware stays unchanged.
        app.middlewares.clear()
        runner = web.AppRunner(app, access_log=None)
        await runner.setup()
        site = web.TCPSite(runner, '127.0.0.1', 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        print(json.dumps({'port': port}), flush=True)
        try:
            await asyncio.Event().wait()
        finally:
            await runner.cleanup()

if __name__ == '__main__':
    asyncio.run(main())
