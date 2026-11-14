import asyncio
import io
import json
import unittest
import zipfile
import os
import hashlib
from pathlib import Path
import subprocess
import tempfile
from unittest.mock import AsyncMock,patch

from calendar_connection import BridgeGoogle,Connection,bridge_package,FILES
from google_calendar import GoogleError


class ConnectionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.ha=AsyncMock()
        self.app={'ha':self.ha,'sources':[{}, {'entity':'calendar.joern'}]}
    def native_status(self):
        return {'success':True,'protocol':1,'version':'0.19.0','configured':True,'binding':'a'*64,'calendarId':'own@example.test'}
    async def test_existing_ha_login_is_preferred_without_reading_secrets(self):
        self.ha.service.return_value=self.native_status()
        connection=Connection(self.app,{'google_calendar_edit_enabled':True})
        with patch('google_calendar.read_credentials',side_effect=AssertionError('No extra credentials')):
            result=await connection.status()
        self.assertTrue(result['configured']);self.assertEqual(result['mode'],'homeassistant')
        self.assertIs(connection.active,connection.bridge)
        self.assertTrue(connection.calendar.endswith('a'*64))
        self.ha.service.return_value={'success':True,'result':{'id':'own@example.test','name':'Jörn'}}
        self.assertEqual((await connection.info())['name'],'Jörn')
        args=self.ha.service.call_args.args
        self.assertEqual(args[:2],('familienkueche_calendar','request'))
        self.assertEqual(args[2]['binding'],'a'*64)
        self.assertNotIn('token',json.dumps(args[2]))
    async def test_missing_bridge_does_not_enable_or_read_unconfigured_direct_login(self):
        self.ha.service.side_effect=OSError('private transport details')
        connection=Connection(self.app,{})
        with patch('google_calendar.read_credentials',side_effect=AssertionError('No secret access')):
            result=await connection.status()
        self.assertEqual(result['mode'],'setup');self.assertFalse(result['configured']);self.assertFalse(result['available'])
        with self.assertRaises(GoogleError):await connection.info()
    async def test_explicit_old_direct_configuration_still_works(self):
        self.ha.service.side_effect=OSError('not installed')
        connection=Connection(self.app,{'google_calendar_edit_enabled':True})
        with patch('google_calendar.read_credentials',return_value={'client_id':'test','client_secret':'test','refresh_token':'test'}):
            result=await connection.status()
        self.assertEqual(result['mode'],'direct');self.assertIs(connection.active,connection.direct)
    async def test_installed_but_unlinked_and_version_mismatch_are_setup_states(self):
        for value in ({'success':False,'configured':False,'error':'Kalender auswählen'}, {**self.native_status(),'protocol':2}):
            self.ha.service.return_value=value
            state=await Connection(self.app,{}).status()
            self.assertTrue(state['available']);self.assertFalse(state['configured']);self.assertEqual(state['mode'],'setup')
    async def test_patch_uncertainty_and_definite_rejection_are_preserved_without_retry(self):
        client=BridgeGoogle(self.ha,'calendar.joern');client.binding='a'*64
        for response,uncertain in (({'success':False,'error':'Geändert','status':409,'uncertain':False},False),
                                   ({'success':False,'error':'Unklar','status':502,'uncertain':True},True),({},True),(None,True)):
            self.ha.service.return_value=response
            with self.assertRaises(GoogleError) as caught:await client.patch('id',{'summary':'Neu'},'"v1"')
            self.assertEqual(caught.exception.uncertain,uncertain)
        self.assertEqual(self.ha.service.await_count,4)
        self.ha.service.side_effect=asyncio.TimeoutError()
        with self.assertRaises(GoogleError) as caught:await client.patch('id',{'summary':'Neu'},'"v1"')
        self.assertTrue(caught.exception.uncertain)
    async def test_only_bounded_read_params_are_forwarded(self):
        client=BridgeGoogle(self.ha,'calendar.joern');client.binding='a'*64
        self.ha.service.return_value={'success':True,'result':[]}
        await client.events({'iCalUID':'uid','timeMin':'2026-11-10T00:00:00Z','timeMax':'2026-11-11T00:00:00Z','singleEvents':'true','url':'https://untrusted.example'})
        payload=self.ha.service.call_args.args[2]
        self.assertEqual(set(payload['params']),{'iCalUID','timeMin','timeMax'})
    def test_installation_package_is_deterministic_and_only_contains_reviewed_files(self):
        data=bridge_package();self.assertEqual(data,bridge_package())
        with zipfile.ZipFile(io.BytesIO(data)) as package:
            names=package.namelist()
            self.assertEqual(set(names),{'custom_components/familienkueche_calendar/'+p for p in FILES})
            self.assertTrue(all(not p.startswith('/') and '..' not in p.split('/') for p in names))
            self.assertEqual(json.loads(package.read('custom_components/familienkueche_calendar/manifest.json'))['version'],'0.19.0')
            self.assertTrue(all('token' not in p and 'secrets' not in p and '__pycache__' not in p for p in names))

    def test_terminal_install_checksum_and_no_overwrite_without_network(self):
        root=Path(__file__).resolve().parents[1]
        raw=bridge_package()
        self.assertEqual((root/'familienkueche-calendar.zip').read_bytes(),raw)
        checksum=hashlib.sha256(raw).hexdigest()
        self.assertIn(checksum,(root/'bridge-install.sh').read_text())
        self.assertIn(checksum,(root/'GOOGLE_CALENDAR.md').read_text())
        with tempfile.TemporaryDirectory(prefix='bridge-install-test-') as directory:
            local=Path(directory);config=local/'config';config.mkdir();(config/'configuration.yaml').write_text('original: remains\n')
            bin=local/'bin';bin.mkdir();wget=bin/'wget';wget.write_text('#!/bin/sh\ncp "$FAMILY_INSTALL_PACKAGE" "$3"\n');wget.chmod(0o755)
            archive=local/'package.zip';archive.write_bytes(raw)
            env={**os.environ,'FAMILY_CONFIG_DIR':str(config),'FAMILY_INSTALL_PACKAGE':str(archive),'PATH':str(bin)+os.pathsep+os.environ['PATH']}
            result=subprocess.run(['sh',str(root/'bridge-install.sh')],env=env,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            target=config/'custom_components'/'familienkueche_calendar'
            self.assertTrue((target/'manifest.json').exists());self.assertEqual((config/'configuration.yaml').read_text(),'original: remains\n')
            (target/'local-marker').write_text('keep')
            again=subprocess.run(['sh',str(root/'bridge-install.sh')],env=env,capture_output=True,text=True)
            self.assertNotEqual(again.returncode,0);self.assertEqual((target/'local-marker').read_text(),'keep')
            other=local/'other-config';other.mkdir();archive.write_bytes(b'wrong checksum')
            refused=subprocess.run(['sh',str(root/'bridge-install.sh')],env={**env,'FAMILY_CONFIG_DIR':str(other)},capture_output=True,text=True)
            self.assertNotEqual(refused.returncode,0);self.assertFalse((other/'custom_components').exists())


if __name__=='__main__':unittest.main()
