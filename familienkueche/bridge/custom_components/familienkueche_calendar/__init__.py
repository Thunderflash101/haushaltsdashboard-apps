"""Small, explicit Google editing bridge for the Familienküche app."""
import asyncio

import voluptuous as vol
from homeassistant.core import SupportsResponse
from homeassistant.auth.permissions.const import POLICY_CONTROL
from homeassistant.exceptions import ConfigEntryNotReady,ConfigEntryError

from .google import BridgeError, DOMAIN, Google, VERSION, source


async def async_setup(hass, config):
    hass.data.setdefault(DOMAIN,{})
    async def handle(call):
        entity=call.data['entity_id']
        if call.context.user_id:
            user=await hass.auth.async_get_user(call.context.user_id)
            if not user or not user.is_active or not user.permissions.check_entity(entity,POLICY_CONTROL):
                return {'success':False,'error':'Keine Berechtigung für diesen Kalender.','status':403,'uncertain':False}
        selected=next((entry for entry in hass.data[DOMAIN].values() if entry.data.get('calendar_entity')==entity),None)
        if not selected:
            return {'success':False,'error':'Diesen Kalender zuerst unter Geräte & Dienste mit Familienküche Kalender verbinden.','status':503,'uncertain':False,'configured':False}
        try:
            _,calendar,binding=source(hass,entity)
            client=selected.runtime_data
            operation=call.data['operation']
            if operation=='status':
                return {'success':True,'protocol':1,'version':VERSION,'configured':True,'calendarId':calendar,'binding':binding}
            if call.data.get('binding')!=binding:
                raise BridgeError('Die Kalenderverbindung wurde geändert. Bitte erneut prüfen.',409)
            async with asyncio.timeout(50):
                if operation=='info':result=await client.info()
                elif operation=='events':result=await client.events(call.data.get('params',{}),binding)
                elif operation=='get':result=await client.get(call.data.get('event_id'),binding)
                else:result=await client.patch(call.data.get('event_id'),call.data.get('patch'),call.data.get('etag'),binding)
            return {'success':True,'result':result}
        except BridgeError as err:
            return {'success':False,'error':str(err),'status':err.status,'uncertain':err.uncertain}
        except Exception:
            # Never serialize/log raw OAuth or HTTP exceptions.
            return {'success':False,'error':'Die Kalenderverbindung ist momentan nicht verfügbar.','status':503,'uncertain':call.data['operation']=='patch'}
    hass.services.async_register(DOMAIN,'request',handle,schema=vol.Schema({
        vol.Required('entity_id'):str,
        vol.Required('operation'):vol.In(('status','info','events','get','patch')),
        vol.Optional('binding'):str,
        vol.Optional('params'):dict,
        vol.Optional('event_id'):str,
        vol.Optional('patch'):dict,
        vol.Optional('etag'):str,
    }),supports_response=SupportsResponse.ONLY)
    return True


async def async_setup_entry(hass,entry):
    try:
        source(hass,entry.data['calendar_entity'])
    except BridgeError as err:
        if err.status==503:raise ConfigEntryNotReady(str(err)) from None
        raise ConfigEntryError(str(err)) from None
    entry.runtime_data=Google(hass,entry.data['calendar_entity'])
    hass.data[DOMAIN][entry.entry_id]=entry
    return True


async def async_unload_entry(hass,entry):
    hass.data[DOMAIN].pop(entry.entry_id,None)
    return True
