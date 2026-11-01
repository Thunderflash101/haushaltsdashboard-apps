"""Configure or reconfigure the local bridge without editing YAML."""
from aiohttp import ClientError, ClientTimeout
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers import selector
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from .const import DEFAULT_BACKEND, DOMAIN
from .validation import normalize_backend, validate_webhook


def form_schema(defaults):
    return vol.Schema({
        vol.Required("backend_url", default=defaults.get("backend_url", DEFAULT_BACKEND)): str,
        vol.Required("bridge_secret", default=defaults.get("bridge_secret", "")): selector.TextSelector(
            selector.TextSelectorConfig(type=selector.TextSelectorType.PASSWORD)
        ),
    })


async def validate(hass, user_input):
    """Return normalized settings and a form error, without leaking credentials."""
    try:
        backend = normalize_backend(user_input.get("backend_url", ""))
    except ValueError:
        return None, "invalid_backend"
    secret = str(user_input.get("bridge_secret", "")).strip()
    if len(secret) != 64 or any(c not in "0123456789abcdef" for c in secret):
        return None, "invalid_secret"
    try:
        session = async_get_clientsession(hass)
        async with session.get(
            backend + "/health", headers={"Authorization": "Bearer " + secret},
            timeout=ClientTimeout(total=10), allow_redirects=False,
        ) as response:
            if response.status == 401:
                return None, "invalid_secret"
            if response.status != 200:
                return None, "cannot_connect"
            validate_webhook((await response.json()).get("webhook"))
    except (ClientError, TimeoutError, ValueError):
        return None, "cannot_connect"
    return {"backend_url": backend, "bridge_secret": secret}, None


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        errors = {}
        if user_input is not None:
            data, error = await validate(self.hass, user_input)
            if error:
                errors["base"] = error
            else:
                return self.async_create_entry(title="Haushaltsdashboard Bankrückleitung", data=data)
        return self.async_show_form(step_id="user", data_schema=form_schema(user_input or {}), errors=errors)

    async def async_step_reconfigure(self, user_input=None):
        """Switch the existing entry to the repository app and reload it."""
        entry = self._get_reconfigure_entry()
        errors = {}
        if user_input is not None:
            data, error = await validate(self.hass, user_input)
            if error:
                errors["base"] = error
            else:
                return self.async_update_reload_and_abort(entry, data_updates=data)
        return self.async_show_form(
            step_id="reconfigure", data_schema=form_schema(user_input or dict(entry.data)), errors=errors,
        )
