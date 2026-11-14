"""Run with HA 2026.10.4 / Python 3.14; never contact a real Google account."""
import asyncio
import json
from pathlib import Path
import sys
import tempfile
import time
from types import MappingProxyType, SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'bridge'))
from homeassistant.config_entries import ConfigEntries,ConfigEntry,ConfigEntryState
from homeassistant.core import HomeAssistant,Context
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers import entity_registry,device_registry,config_entry_oauth2_flow as oauth
from custom_components.familienkueche_calendar import async_setup,async_setup_entry,async_unload_entry
from custom_components.familienkueche_calendar.config_flow import ConfigFlow
from custom_components.familienkueche_calendar.google import DOMAIN,BridgeError,Google,source


def config_entry(domain,unique_id,data):
    return ConfigEntry(domain=domain,title='Test',unique_id=unique_id,data=data,options={},source='user',version=1,minor_version=1,
        discovery_keys=MappingProxyType({}),subentries_data=None,state=ConfigEntryState.LOADED)


class Response:
    def __init__(self,status,data):self.status=status;self.raw=json.dumps(data).encode();self.content=self
    async def __aenter__(self):return self
    async def __aexit__(self,*args):pass
    async def iter_chunked(self,size):
        for i in range(0,len(self.raw),11):yield self.raw[i:i+11]


class BridgeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='ha-bridge-real-framework-')
        self.hass=HomeAssistant(self.temp.name)
        self.hass.config_entries=ConfigEntries(self.hass,{})
        device_registry.async_setup(self.hass)
        await device_registry.async_load(self.hass)
        await entity_registry.async_load(self.hass)
        self.native=config_entry('google','owner@example.test',{'auth_implementation':'test','token':{'access_token':'old-access-token','refresh_token':'native-refresh-test-only','expires_at':time.time()-100,'scope':'https://www.googleapis.com/auth/calendar'}})
        with patch.object(ConfigEntries,'async_setup',AsyncMock(return_value=True)):
            await self.hass.config_entries.async_add(self.native)
        self.registry=entity_registry.async_get(self.hass)
        self.entity=self.registry.async_get_or_create('calendar','google','owner@example.test-shared-calendar@example.test',config_entry=self.native,suggested_object_id='joern')
        self.hass.states.async_set(self.entity.entity_id,'off',{'supported_features':3})
        self.implementation=SimpleNamespace(domain='test',service_domain='google',async_refresh_token=AsyncMock(return_value={'access_token':'fresh-access-test-only','refresh_token':'native-refresh-test-only','expires_at':time.time()+3600,'scope':'https://www.googleapis.com/auth/calendar'}))
        oauth.async_register_implementation(self.hass,'google',self.implementation)
        self.responses=[];self.calls=[]
        async def http(method,url,**kwargs):
            self.calls.append((method,url,kwargs))
            if not self.responses:raise AssertionError('Unexpected HTTP '+url)
            result=self.responses.pop(0)
            if isinstance(result,Exception):raise result
            return result
        self.http_patch=patch('homeassistant.helpers.config_entry_oauth2_flow.async_get_clientsession',return_value=SimpleNamespace(request=http))
        self.http_patch.start()
        await async_setup(self.hass,{})
        self.bridge=config_entry(DOMAIN,'binding',{'calendar_entity':self.entity.entity_id})
        await async_setup_entry(self.hass,self.bridge)

    async def asyncTearDown(self):
        self.http_patch.stop()
        await self.hass.async_stop(force=True)
        self.temp.cleanup()

    async def call(self,operation,**data):
        return await self.hass.services.async_call(DOMAIN,'request',{'entity_id':self.entity.entity_id,'operation':operation,**data},blocking=True,return_response=True)

    async def binding(self):return (await self.call('status'))['binding']

    async def test_status_uses_real_registry_and_no_google_or_credential_export(self):
        result=await self.call('status')
        self.assertTrue(result['configured']);self.assertEqual(result['protocol'],1)
        self.assertEqual(result['calendarId'],'shared-calendar@example.test')
        self.assertEqual(len(result['binding']),64)
        self.assertEqual(self.calls,[])
        self.assertNotIn('native-refresh',json.dumps(result));self.assertNotIn('access-token',json.dumps(result))

    async def test_native_oauth_refresh_and_separate_calendar_id_resolved_without_secrets(self):
        binding=await self.binding()
        self.responses=[Response(200,{'id':'shared-calendar@example.test','summary':'Jörn','accessRole':'owner'}),Response(200,{'id':'event1','etag':'"version1"'})]
        result=await self.call('info',binding=binding)
        self.assertTrue(result['success']);self.assertEqual(result['result']['name'],'Jörn')
        result=await self.call('get',binding=binding,event_id='event1')
        self.assertTrue(result['success'])
        self.implementation.async_refresh_token.assert_awaited_once()
        self.assertEqual(self.native.data['token']['access_token'],'fresh-access-test-only')
        self.assertTrue(self.calls[0][1].endswith('users/me/calendarList/shared-calendar%40example.test'))
        self.assertEqual(self.calls[1][2]['headers']['Authorization'],'Bearer fresh-access-test-only')
        self.assertFalse(self.calls[1][2]['allow_redirects'])
        self.assertNotIn('native-refresh',json.dumps(result))

    async def test_patch_is_atomic_narrow_and_retains_native_google_state(self):
        binding=await self.binding()
        self.responses=[Response(200,{'id':'shared-calendar@example.test','accessRole':'owner'}),
            Response(200,{'id':'event1','etag':'"version1"','organizer':{'self':True}}),Response(200,{'id':'event1','etag':'"version2"','summary':'Neu'})]
        result=await self.call('patch',binding=binding,event_id='event1',etag='"version1"',patch={'summary':'Neu'})
        self.assertTrue(result['success'])
        method,url,kwargs=self.calls[-1]
        self.assertEqual(method,'PATCH');self.assertEqual(kwargs['headers']['If-Match'],'"version1"')
        self.assertEqual(kwargs['json'],{'summary':'Neu'});self.assertEqual(kwargs['params'],{'sendUpdates':'none'})
        self.assertEqual(self.native.data['token']['refresh_token'],'native-refresh-test-only')
        self.assertEqual(self.native.domain,'google')

    async def test_stale_binding_and_unknown_entity_fail_before_http(self):
        result=await self.call('get',binding='a'*64,event_id='event1')
        self.assertFalse(result['success']);self.assertEqual(result['status'],409)
        result=await self.hass.services.async_call(DOMAIN,'request',{'entity_id':'calendar.other','operation':'status'},blocking=True,return_response=True)
        self.assertFalse(result['configured']);self.assertEqual(self.calls,[])

    async def test_native_read_only_and_unrecognized_registry_identity_fail_closed(self):
        self.hass.states.async_set(self.entity.entity_id,'off',{'supported_features':0})
        result=await self.call('status');self.assertFalse(result['success']);self.assertEqual(result['status'],403)
        self.hass.states.async_set(self.entity.entity_id,'off',{'supported_features':3})
        self.registry.async_update_entity(self.entity.entity_id,new_unique_id='future-unrecognized-id')
        result=await self.call('status');self.assertFalse(result['success']);self.assertEqual(result['status'],409)
        self.assertEqual(self.calls,[])

    async def test_disallowed_patch_fields_and_unbounded_search_never_call_google(self):
        binding=await self.binding()
        for payload in ({'attendees':[]},{'recurrence':[]},{'summary':''},{'start':{'date':'2026-11-10'}}):
            result=await self.call('patch',binding=binding,event_id='event1',etag='"v1"',patch=payload)
            self.assertFalse(result['success']);self.assertEqual(result['status'],400)
        result=await self.call('events',binding=binding,params={'timeMin':'2020-01-01T00:00:00Z','timeMax':'2030-01-01T00:00:00Z'})
        self.assertFalse(result['success']);self.assertEqual(self.calls,[])

    async def test_google_conflict_uncertainty_and_redirect_are_safe_envelopes(self):
        binding=await self.binding()
        for status,uncertain in ((412,False),(500,True),(302,True)):
            self.responses=[Response(200,{'id':'shared-calendar@example.test','accessRole':'owner'}),Response(200,{'id':'event1','etag':'"v1"','organizer':{'self':True}}),Response(status,{'secret':'must-not-escape'})]
            result=await self.call('patch',binding=binding,event_id='event1',etag='"v1"',patch={'summary':'Neu'})
            self.assertFalse(result['success']);self.assertEqual(result['uncertain'],uncertain)
            self.assertNotIn('must-not-escape',json.dumps(result))

    async def test_master_and_other_organizer_never_patch(self):
        binding=await self.binding()
        for extra in ({'recurrence':['RRULE:FREQ=DAILY'],'organizer':{'self':True}},{'organizer':{'email':'foreign@example.test'}}):
            self.responses=[Response(200,{'id':'shared-calendar@example.test','accessRole':'owner'}),Response(200,{'id':'event1','etag':'"v1"',**extra})]
            result=await self.call('patch',binding=binding,event_id='event1',etag='"v1"',patch={'summary':'Neu'})
            self.assertFalse(result['success']);self.assertEqual(result['status'],403)
        self.assertTrue(all(method!='PATCH' for method,_,_ in self.calls))

    async def test_unload_removes_access_without_changing_google_entry(self):
        await async_unload_entry(self.hass,self.bridge)
        result=await self.call('status');self.assertFalse(result['configured'])
        self.assertIs(self.hass.config_entries.async_get_entry(self.native.entry_id),self.native)

    async def test_user_permissions_are_respected_without_google_requests(self):
        self.hass.auth=SimpleNamespace(async_get_user=AsyncMock(return_value=SimpleNamespace(is_active=True,permissions=SimpleNamespace(check_entity=lambda entity,policy:False))))
        result=await self.hass.services.async_call(DOMAIN,'request',{'entity_id':self.entity.entity_id,'operation':'status'},blocking=True,return_response=True,context=Context(user_id='restricted-user'))
        self.assertFalse(result['success']);self.assertEqual(result['status'],403);self.assertEqual(self.calls,[])

    async def test_temporarily_unavailable_google_calendar_retries_setup(self):
        self.hass.states.async_set(self.entity.entity_id,'unavailable',{'supported_features':3})
        with self.assertRaises(ConfigEntryNotReady):await async_setup_entry(self.hass,self.bridge)

    async def test_flow_shows_existing_calendar_selector_and_no_credentials(self):
        flow=ConfigFlow();flow.hass=self.hass;flow.context={'source':'user'}
        result=await flow.async_step_user()
        self.assertEqual(result['type'],'form');self.assertEqual(result['step_id'],'user')
        self.assertEqual([str(key) for key in result['data_schema'].schema],['calendar_entity'])
        self.responses=[Response(200,{'id':'shared-calendar@example.test','summary':'Jörn','accessRole':'owner'})]
        result=await flow.async_step_user({'calendar_entity':self.entity.entity_id})
        self.assertEqual(result['type'],'create_entry');self.assertEqual(result['data'],{'calendar_entity':self.entity.entity_id})
        self.assertEqual(result['title'],'Jörn')


if __name__=='__main__':unittest.main()
