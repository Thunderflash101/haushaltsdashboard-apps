#!/usr/bin/env bash
set -euo pipefail

# Official Linux x64 release asset; digest verified against its GitHub release metadata.
# Update these together with the pinned pre-commit revision.
GITLEAKS_VERSION='8.30.1'
GITLEAKS_SHA256='551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'
destination="${1:?Usage: bash tools/install_gitleaks.sh DESTINATION}"
archive="gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT

curl --fail --location --silent --show-error --retry 3 \
  "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${archive}" \
  --output "$staging/$archive"
printf '%s  %s\n' "$GITLEAKS_SHA256" "$staging/$archive" | sha256sum --check --status
mkdir -p "$destination"
tar -xzf "$staging/$archive" -C "$destination" gitleaks
chmod 0755 "$destination/gitleaks"
"$destination/gitleaks" version
