"""Focused bridge tests; HA framework calls are mocked, not a full Core test."""
import asyncio
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

ROOT = Path(__file__).resolve().parents[1] / "custom_components/haushalt_bank_callback"

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

validation = load("bridge_validation", ROOT / "validation.py")

class BridgeTests(unittest.TestCase):
    def test_only_internal_app_hosts_are_allowed(self):
        self.assertEqual(validation.normalize_backend("http://03c7e9d7-haushaltsdashboard:8100/"), "http://03c7e9d7-haushaltsdashboard:8100")
        for value in ("http://127.0.0.1:8100", "https://example.org", "http://local-haushaltsdashboard:8100/private", "http://local-haushaltsdashboard:8100@evil.example"):
            with self.assertRaises(ValueError):
                validation.normalize_backend(value)

    def test_webhook_is_validated_before_it_is_used_in_a_url(self):
        self.assertEqual(validation.validate_webhook("test-hook-0123456789"), "test-hook-0123456789")
        for value in ("short", "../../private", "x" * 129, None):
            with self.assertRaises(ValueError):
                validation.validate_webhook(value)

    def test_reconfigure_updates_existing_entry_instead_of_creating_a_second_one(self):
        class FakeFlow:
            def __init_subclass__(cls, **kwargs):
                super().__init_subclass__()
            def _get_reconfigure_entry(self):
                return self.entry
            def async_update_reload_and_abort(self, entry, data_updates):
                entry.data.update(data_updates)
                self.reloaded = True
                return {"type": "abort", "reason": "reconfigure_successful"}
            def async_create_entry(self, **kwargs):
                raise AssertionError("Reconfigure must not create a second integration")
        package = ModuleType("test_bridge"); package.__path__ = [str(ROOT)]
        ha = ModuleType("homeassistant"); ha.config_entries = SimpleNamespace(ConfigFlow=FakeFlow)
        helpers = ModuleType("homeassistant.helpers"); helpers.selector = SimpleNamespace()
        client = ModuleType("homeassistant.helpers.aiohttp_client"); client.async_get_clientsession = lambda hass: None
        vol = ModuleType("voluptuous")
        http = ModuleType("aiohttp"); http.ClientError = type("ClientError", (Exception,), {}); http.ClientTimeout = lambda **kwargs: None
        modules={"test_bridge":package,"homeassistant":ha,"homeassistant.helpers":helpers,"homeassistant.helpers.aiohttp_client":client,"voluptuous":vol,"aiohttp":http}
        with patch.dict(sys.modules, modules):
            load("test_bridge.const", ROOT / "const.py")
            load("test_bridge.validation", ROOT / "validation.py")
            flow_module = load("test_bridge.config_flow", ROOT / "config_flow.py")
            flow=flow_module.ConfigFlow(); flow.hass=object(); flow.entry=SimpleNamespace(data={"backend_url":"http://local-haushaltsdashboard:8100"}); flow.reloaded=False
            updated={"backend_url":"http://03c7e9d7-haushaltsdashboard:8100","bridge_secret":"a"*64}
            with patch.object(flow_module, "validate", AsyncMock(return_value=(updated,None))):
                result=asyncio.run(flow.async_step_reconfigure(updated))
            self.assertEqual(result["reason"], "reconfigure_successful")
            self.assertTrue(flow.reloaded)
            self.assertEqual(flow.entry.data, updated)

if __name__ == "__main__":
    unittest.main()
