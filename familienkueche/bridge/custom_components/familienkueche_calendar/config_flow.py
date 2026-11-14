"""Choose an existing Google entity; never ask for credentials."""
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers import entity_registry, selector

from .google import BridgeError, DOMAIN, Google, source


class ConfigFlow(config_entries.ConfigFlow,domain=DOMAIN):
    VERSION=1
    async def async_step_user(self,user_input=None):
        errors={}
        if user_input:
            entity=user_input.get('calendar_entity','')
            try:
                _,_,binding=source(self.hass,entity)
                await self.async_set_unique_id(binding)
                self._abort_if_unique_id_configured()
                info=await Google(self.hass,entity).info()
                return self.async_create_entry(title=info['name'],data={'calendar_entity':entity})
            except BridgeError as err:
                errors['base']='read_only' if err.status==403 else 'cannot_connect'
        registry=entity_registry.async_get(self.hass)
        available=[e.entity_id for e in registry.entities.values() if e.platform=='google' and e.domain=='calendar' and not e.disabled_by]
        if not available:return self.async_abort(reason='no_google_calendar')
        return self.async_show_form(step_id='user',data_schema=vol.Schema({
            vol.Required('calendar_entity',default=available[0] if len(available)==1 else vol.UNDEFINED):selector.EntitySelector(selector.EntitySelectorConfig(domain='calendar',include_entities=available))
        }),errors=errors)
