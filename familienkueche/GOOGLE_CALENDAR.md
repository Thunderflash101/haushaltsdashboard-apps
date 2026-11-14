# Vorhandenen Google-Kalender einfach verbinden

Ab Familienküche **0.19.0** kann die bestehende Google-Anmeldung aus Home Assistant verwendet werden. **Kein neues Google-Projekt, keine neue Client-ID und kein manuell kopierter Refresh-Token sind nötig.**

Dafür wird einmalig die kleine Erweiterung **Familienküche Kalender** installiert. Sie läuft innerhalb von Home Assistant und nutzt dessen öffentliche OAuth-Verwaltung. Die Google-Zugangsdaten bleiben in HA. In der Familienküche bleibt die bekannte Bearbeitungsoberfläche erhalten.

## 1. Familienküche aktualisieren

Das angebotene App-Update auf mindestens **0.19.0** installieren und die Dashboardseite neu laden. Die bestehende Google-Integration und die bisherigen Kalenderzuordnungen beibehalten. Die früheren Optionen `google_calendar_edit_enabled` und `google_calendar_edit_id` werden für diesen Weg nicht benötigt.

## 2. Erweiterung einmalig installieren

Wenn eine Terminal-App wie **Terminal & SSH** oder ein Terminal in **Studio Code Server** vorhanden ist, dort den folgenden vollständigen Block einmal einfügen. Er lädt ausschließlich das veröffentlichte Installationspaket, prüft seine SHA-256-Prüfsumme und legt den neuen Ordner unter `/config/custom_components/familienkueche_calendar` an. Vorhandene Ordner werden nicht überschrieben. Andere Integrationen und Einstellungen bleiben erhalten; der Block startet HA nicht selbst neu.

```sh
(
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
)
```

Der Block ist außerdem als [bridge-install.sh](bridge-install.sh) einsehbar. Bei abweichendem Konfigurationspfad kann `FAMILY_CONFIG_DIR` gesetzt werden. Die Prüfsumme muss stimmen; bei Abweichung die aktuelle Anleitung öffnen und nicht ungeprüft entpacken.

**Alternativ ohne Terminal-Download:** In der Familienküche unter **Optionen → Kalender direkt bearbeiten einrichten → Installationspaket herunterladen** das ZIP speichern, auf einem Rechner entpacken und den enthaltenen Ordner `custom_components/familienkueche_calendar` in den HA-Konfigurationsordner kopieren. Danach muss zum Beispiel `/config/custom_components/familienkueche_calendar/manifest.json` existieren. Dasselbe Paket liegt [hier im Repository](familienkueche-calendar.zip).

Anschließend **Home Assistant einmal neu starten**. Während des Neustarts sind Automationen und die Oberfläche kurz nicht verfügbar. Erst danach kann HA die neue Integration laden.

## 3. Den vorhandenen Kalender auswählen

Unter **Einstellungen → Geräte & Dienste → Integration hinzufügen** nach **Familienküche Kalender** suchen. Alternativ führt [dieser Link zum Einrichtungsdialog](https://my.home-assistant.io/redirect/config_flow_start/?domain=familienkueche_calendar).

Jörns **bereits vorhandenen Google-Kalender** auswählen und bestätigen. Ein neuer Google-Kalender wird dabei nicht angelegt. Der Dialog zeigt nur Google-Kalender aus der vorhandenen HA-Integration. Das gewählte Konto muss Eigentümer sein; der Kalender muss in HA Schreibzugriff erlauben. Tinas importierter iCal-Kalender bleibt lesbar.

## 4. Im Dashboard prüfen

Zur Familienküche zurückkehren: **Optionen → Kalender direkt bearbeiten einrichten → Erneut erkennen → Verbindung prüfen**. Angezeigten Kalendernamen und Kalender-ID prüfen. Diese Verbindungskontrolle liest nur Daten und verändert keinen Termin.

Danach einen Termin von Jörn öffnen und **Bearbeiten / Verschieben** wählen. Vor dem Speichern erscheinen weiterhin Vorher/Nachher und mögliche Überschneidungen. Serien werden zunächst nur für das angeklickte einzelne Vorkommen geändert. Versionsprüfung, Schutz vor mehrfacher Speicherung und Erhalt von Gästen, Erinnerungen und Konferenzdaten gelten weiter.

## Was geändert wird

- Die App bekommt keinen Google-Token. Sie ruft eine eng begrenzte HA-Aktion für den ausdrücklich verbundenen Kalender auf.
- Die Erweiterung nutzt Home Assistants `OAuth2Session` und die vorhandene Google-Konfiguration. HA verwaltet und erneuert die Anmeldung wie bisher.
- Die native Google-Integration wird nicht ersetzt oder verändert. Ihre fehlende Update-Funktion wird nicht durch manipulierte Funktionsflags freigeschaltet.
- Google-Termine werden mit `PATCH` und `If-Match` am bestehenden Termin geändert. Es gibt kein Löschen und Neuanlegen.
- Änderungen sind auf Titel, Ort, Beschreibung und den Zeitraum einzelner selbst organisierter Standardtermine begrenzt. Keine Einladungs-E-Mails, Serienmaster-Änderungen oder freien HTTP-Anfragen.
- Die Verbindung ist über die HA-Integration wieder entfernbar; die Google-Anmeldung und Kalender bleiben bestehen.

## Wenn etwas nicht erkannt wird

- **Erweiterung nicht erreichbar:** Paketpfad prüfen, HA nach der Installation neu starten und den Browser neu laden.
- **Kalender noch nicht verbunden:** Die Integration **Familienküche Kalender** unter Geräte & Dienste hinzufügen und den Kalender auswählen. Eine Installation allein wählt keinen Kalender aus.
- **Google-Anmeldung abgelaufen:** Die vorhandene Google-Integration in HA erneut authentifizieren. Die Familienküche verlangt dafür keine eigenen Secrets.
- **Nur lesbar / fremder Organisator / spezieller Termin:** In Google Kalender bearbeiten. Die Erweiterung erweitert keine Kontoberechtigungen.
- **Kalenderzuordnung geändert oder unbekannt:** HA- und App-Zuordnung prüfen. Bei unbekannten Kennungen wird die Bearbeitung gesperrt, statt einen anderen Termin zu ändern.

Die HA-Schnittstellen und Token-Erneuerung wurden gegen **Home Assistant 2026.10.4** geprüft. Die Zuordnung berücksichtigt das seit HA 2022.7 verwendete Google-Format der Entitätskennung. Sollte dieses Format in einer künftigen HA-Version geändert werden, meldet die Erweiterung dies und verweigert Änderungen. Sie greift nicht auf private Google-Objektattribute oder `.storage`-Dateien zu.

Eine bereits manuell eingerichtete direkte Google-Verbindung aus 0.18.0 funktioniert weiter. Die [bisherige separate Einrichtung](GOOGLE_CALENDAR_DIRECT.md) bleibt als Alternative dokumentiert; für den oben beschriebenen Weg wird sie nicht benötigt.
