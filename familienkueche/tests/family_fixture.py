"""Loopback-only backend for browser tests; temporary DB, no HA connection."""
import asyncio
import json
import tempfile
from pathlib import Path
import sys
from unittest.mock import AsyncMock
from aiohttp import web

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import make_app

async def main():
    with tempfile.TemporaryDirectory(prefix='family-browser-') as root:
        app = make_app(AsyncMock(), str(Path(root) / 'fixture.sqlite'))
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
