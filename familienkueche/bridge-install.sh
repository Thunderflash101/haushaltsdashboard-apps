#!/bin/sh
# Install only the reviewed Familienküche calendar component; never restart HA.
set -eu
family_config="${FAMILY_CONFIG_DIR:-/config}"
family_target="$family_config/custom_components/familienkueche_calendar"
if [ ! -d "$family_config" ]; then
  echo "Home-Assistant-Konfigurationsordner nicht gefunden: $family_config" >&2
  exit 1
fi
if [ -e "$family_target" ]; then
  echo "Die Erweiterung ist bereits vorhanden. Es wird nichts überschrieben." >&2
  exit 1
fi
family_tmp=$(mktemp -d)
trap 'rm -rf "$family_tmp"' EXIT
wget -q -O "$family_tmp/calendar.zip" 'https://raw.githubusercontent.com/Thunderflash101/haushaltsdashboard-apps/main/familienkueche/familienkueche-calendar.zip'
printf '%s  %s\n' '56aece849ffa9cc43f89406a5082806e1344993b29b9b6263be9adb3e439498f' "$family_tmp/calendar.zip" | sha256sum -c -
unzip -q "$family_tmp/calendar.zip" -d "$family_tmp"
mkdir -p "$family_config/custom_components"
# Check again before moving the complete directory into place.
if [ -e "$family_target" ]; then
  echo "Ziel wurde inzwischen angelegt. Es wird nichts überschrieben." >&2
  exit 1
fi
mv "$family_tmp/custom_components/familienkueche_calendar" "$family_target"
echo "Familienküche Kalender installiert. Home Assistant jetzt einmal neu starten."
