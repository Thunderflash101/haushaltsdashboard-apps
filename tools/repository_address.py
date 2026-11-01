"""Show the Home Assistant app ID for an exact, stable repository URL."""
import hashlib
import sys

if len(sys.argv) != 2:
    raise SystemExit("Aufruf: python3 tools/repository_address.py https://github.com/OWNER/REPOSITORY")
url = sys.argv[1]
if not url.startswith("https://") or "@" in url:
    raise SystemExit("Eine HTTPS-Repository-URL ohne Zugangsdaten verwenden.")
repository_id = hashlib.sha1(url.lower().encode()).hexdigest()[:8]
print("App-ID:", repository_id + "_haushaltsdashboard")
print("Interne App-Adresse:", "http://" + repository_id + "-haushaltsdashboard:8100")

