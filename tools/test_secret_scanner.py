"""Verify detection and redaction without storing or printing a real credential."""
from pathlib import Path
import secrets
import string
import subprocess
import sys
import tempfile


def main():
    binary = str(Path(sys.argv[1]).resolve())
    # Generated only for this process. It is never issued by GitHub or used for authentication.
    token = "ghp_" + "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(36))
    with tempfile.TemporaryDirectory(prefix="household-scanner-") as directory:
        fixture = Path(directory) / "scanner-fixture.txt"
        fixture.write_text('github_token = "' + token + '"\n')
        command = [binary, "dir", "--redact=100", "--no-banner", directory]
        result = subprocess.run(command, capture_output=True, text=True, timeout=60)
        if result.returncode != 1:
            raise SystemExit("Secret scanner did not detect the synthetic token.")
        if token in result.stdout or token in result.stderr:
            raise SystemExit("Secret scanner did not redact the synthetic token.")
        fixture.write_text("No credentials in this file.\n")
        clean = subprocess.run(command, capture_output=True, text=True, timeout=60)
        if clean.returncode != 0:
            raise SystemExit("Secret scanner rejected the clean control fixture.")
    print("Secret scanner self-test passed: detection, redaction and clean control.")


if __name__ == "__main__":
    main()
