"""Fail publication checks if personal defaults or private files are present."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors = []
seed = json.loads((ROOT / "haushaltsdashboard/app/seed.json").read_text())
if seed != {"joern": None, "account": "", "fixed": [], "bookings": []}:
    errors.append("Die mitgelieferten Startdaten sind nicht leer.")
dashboard = (ROOT / "haushaltsdashboard/app/public/dashboard.html").read_text()
match = re.search(r'<script id="source-data" type="application/json">(.*?)</script>', dashboard, re.S)
if not match or json.loads(match[1]) != seed:
    errors.append("Im Dashboard sind nicht-leere Startdaten eingebettet.")
for path in ROOT.rglob("*"):
    if not path.is_file() or any(p in {".git", "__pycache__", "node_modules"} for p in path.relative_to(ROOT).parts):
        continue
    relative = str(path.relative_to(ROOT))
    if path.suffix.lower() in {".pem", ".key", ".csv", ".p12", ".pfx", ".zip"} or path.name in {"private.json", "dashboard.json", ".env"}:
        errors.append(relative + ": private Datei im Repository")
        continue
    try:
        text = path.read_text()
    except (UnicodeDecodeError, OSError):
        continue
    if re.search(r"-----BEGIN (?:RSA )?PRIVATE KEY-----", text):
        errors.append(relative + ": privater Schlüssel")
    if re.search(r"https://[a-z0-9]{15,}\.ui\.nabu\.casa", text):
        errors.append(relative + ": konkrete private Fernzugriffsadresse")
    # The standard public example IBAN is permitted in tests; real account numbers are not.
    ibans = re.findall(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b", text)
    if any(iban != "DE89370400440532013000" for iban in ibans):
        errors.append(relative + ": konkrete IBAN")
if errors:
    raise SystemExit("\n".join(errors))
print("Repository audit OK: empty seeds; no key files, account numbers or private cloud URLs.")
