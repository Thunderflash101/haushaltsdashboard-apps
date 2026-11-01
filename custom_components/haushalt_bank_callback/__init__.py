"""Forward the one-time bank callback without entities, events or automation traces."""
from aiohttp import ClientError, ClientTimeout, web
from homeassistant.components import webhook
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DEFAULT_BACKEND, DOMAIN
from .validation import normalize_backend, validate_webhook

HEADERS = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
}

def result_page(ok: bool) -> web.Response:
    title = "Bankfreigabe übernommen" if ok else "Bankfreigabe nicht übernommen"
    text = (
        "Du kannst dieses Fenster schließen und in der Haushaltsdashboard-App das Konto auswählen."
        if ok else
        "Öffne die Haushaltsdashboard-App und prüfe dort die Verbindung. Starte die Freigabe bei Bedarf erneut."
    )
    return web.Response(
        text=f'<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title><body style="font:18px/1.6 system-ui;background:#eff5f7;color:#183b46;padding:8vw"><h1>{title}</h1><p>{text}</p></body></html>',
        content_type="text/html", headers=HEADERS,
    )

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Register a GET callback; never log its query or return it to a sensor."""
    backend = normalize_backend(entry.data.get("backend_url", DEFAULT_BACKEND))
    session = async_get_clientsession(hass)
    auth = {"Authorization": "Bearer " + entry.data["bridge_secret"]}
    try:
        async with session.get(backend + "/health", headers=auth, timeout=ClientTimeout(total=10), allow_redirects=False) as response:
            if response.status != 200:
                raise ConfigEntryNotReady("Haushaltsdashboard-App oder Verbindungsschlüssel prüfen")
            webhook_id = validate_webhook((await response.json()).get("webhook"))
    except (ClientError, TimeoutError, ValueError) as err:
        raise ConfigEntryNotReady("Haushaltsdashboard-App ist noch nicht erreichbar") from err

    async def handle_callback(hass: HomeAssistant, registered_id: str, request: web.Request) -> web.Response:
        if request.query.get("result") in ("ok", "error") and not request.query.get("code"):
            return result_page(request.query["result"] == "ok")
        payload = {key: request.query.get(key, "") for key in ("code", "state", "error")}
        if not payload["state"] or len(payload["state"]) > 256 or len(payload["code"]) > 8192:
            return result_page(False)
        ok = False
        try:
            async with session.post(
                backend + "/callback", json=payload, headers=auth,
                timeout=ClientTimeout(total=180), allow_redirects=False,
            ) as response:
                # Intentionally do not include any response body or auth code in logs.
                ok = response.status == 200
                await response.read()
        except (ClientError, TimeoutError):
            pass
        # Drop the one-time code from the visible address after processing.
        return web.HTTPSeeOther(
            location=f"/api/webhook/{webhook_id}?result={'ok' if ok else 'error'}",
            headers=HEADERS,
        )

    try:
        webhook.async_register(
            hass, DOMAIN, "Haushaltsdashboard Bankfreigabe", webhook_id,
            handle_callback, allowed_methods=["GET"], local_only=False,
        )
    except ValueError as err:
        raise ConfigEntryNotReady("Die Webhook-ID wird bereits verwendet") from err
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = webhook_id
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    webhook_id = hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    if webhook_id:
        webhook.async_unregister(hass, webhook_id)
    return True

