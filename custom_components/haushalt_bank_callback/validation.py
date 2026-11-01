"""Only the documented internal app hosts are valid callback destinations."""
import re

def normalize_backend(value: str) -> str:
    value = str(value).strip().rstrip("/")
    if not re.fullmatch(r"http://(?:local|[0-9a-f]{8})-haushaltsdashboard:8100", value):
        raise ValueError("Ungültige interne App-Adresse")
    return value

def validate_webhook(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", value):
        raise ValueError("Ungültige Webhook-ID")
    return value
