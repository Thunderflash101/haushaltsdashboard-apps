# Sicherheit und Grenzen

## Zugriff auf die App

Die Oberfläche auf Container-Port 8099 akzeptiert ausschließlich den Home-Assistant-
Ingress-Absender `172.30.32.2`. Jede Anfrage benötigt zusätzlich eine gültige
HA-Benutzerkennung. Der erste bestätigte Benutzer wird Besitzer; weitere Benutzer
muss der Besitzer ausdrücklich freigeben. Die App bei der Ersteinrichtung deshalb
zuerst mit dem gewünschten Besitzer öffnen.

Freigegebene Haushaltsmitglieder dürfen gemeinsame Finanzdaten lesen und bearbeiten.
Bankverwaltung und Benutzerfreigaben sind dem Besitzer vorbehalten. Diese Freigabe
ist keine Trennung persönlicher Finanzdaten zwischen den Haushaltsmitgliedern.

Container-Port 8100 dient ausschließlich der separaten Bankrückleitungs-Integration
in Home Assistant Core. Beide internen Endpunkte verlangen das genaue
Bearer-Verbindungsgeheimnis. Diese Verbindung läuft nicht über den Ingress und
verwendet deshalb keine Ingress-Benutzerheader. Die App-Konfiguration veröffentlicht
keinen dieser Ports als Host-Port. Zusätzliche Portfreigaben oder Host-Netzwerkbetrieb
sind nicht Bestandteil dieser Konfiguration.

## Daten und Schlüssel

- `private.json` enthält Bankkonfiguration, privaten RSA-Schlüssel und Sitzungsdaten.
- `dashboard.json` enthält Finanzdaten und die aktuelle Speicherrevision.
- Neue bzw. ersetzte Datendateien haben Modus `0600`, neue Daten-/Snapshot-Ordner `0700`.
- Dateischreibvorgänge verwenden eine temporäre Datei, `fsync` und atomare Umbenennung.
- Veraltete Speicherrevisionen werden mit HTTP 409 abgelehnt. Eine einzelne laufende
  App-Instanz besitzt die Dateien; mehrere schreibende Prozesse werden nicht unterstützt.
- Vor Änderungen wird höchstens ein Snapshot pro UTC-Kalendertag angelegt; die letzten
  sieben vorhandenen Snapshot-Tage bleiben erhalten. Diese liegen ebenfalls lokal.

Der private Schlüssel wird nicht durch die Finanzexport-Funktion ausgegeben.
Die App protokolliert keine Schlüssel und gibt keine vollständigen Bankfehlerantworten
zurück. Logs vorgeschalteter Dienste und die Sicherheit des HA-Hosts liegen außerhalb
dieser Codeprüfung.

**Finanz-JSON und lokale Dateien sind derzeit unverschlüsselt.** Der Export enthält
Finanzdaten, aber keine Bankzugangsschlüssel oder Sitzungsdaten. Die Dateirechte
ersetzen keine Datenträgerverschlüsselung und schützen nicht vor einem kompromittierten
HA-Host. Eine optionale passwortverschlüsselte Export-/Importfunktion ist geplant.
Home-Assistant-Sicherungen der App enthalten auch die privaten App-Daten und müssen
entsprechend geschützt aufbewahrt werden.

## Prüfungen im Repository

- Node-Sicherheitsregressionen prüfen Ingress-Grenzen, Benutzer-/Besitzerrechte,
  interne Authentifizierung, Geheimnisschutz, Dateirechte und Speicherkonflikte.
- Der Privacy-Audit sucht nach privaten Dateien, konkreten Kontonummern,
  Fernzugriffsadressen und privaten Schlüsselblöcken.
- Gitleaks prüft die vollständig ausgecheckte Git-Historie. Ausgaben sind maskiert;
  die CI lädt keine Fundberichte als Artefakte hoch und schreibt keine PR-Kommentare.
- Ein künstlicher Testtoken prüft, dass Gitleaks tatsächlich erkennt und maskiert.
  Er wird nie als Zugangsdaten verwendet und nicht in Git gespeichert.
- Das Gitleaks-Archiv wird gegen den im Installer festgelegten SHA-256-Digest geprüft.
  Bei Werkzeugupdates Version, Digest und Pre-commit-Revision zusammen aktualisieren.
- GitHub Actions sind auf Commit-SHAs festgelegt. Dependabot eröffnet wöchentlich
  Update-PRs für Actions und Docker; es gibt keine automatische Übernahme.

Die Scans sind zusätzliche Kontrollen und garantieren nicht, jeden Schlüssel oder
jede Schwachstelle zu erkennen. Der Zustand von GitHub Secret Scanning, Push Protection
und Branch-Regeln ist nicht durch diese Dateien konfiguriert. Lokale Hooks sind optional;
CI führt die Prüfungen bei Push und Pull Request unabhängig davon aus.

## Wenn ein Geheimnis veröffentlicht wurde

Den betroffenen Schlüssel bzw. die Freigabe zuerst beim zuständigen Dienst widerrufen
und ersetzen. Das Entfernen einer Datei aus dem aktuellen Stand entfernt sie nicht aus
der Git-Historie. Veröffentlichte Geheimnisse nicht in Issues, PR-Kommentare oder Logs
kopieren. Eine notwendige Bereinigung der Historie getrennt planen; nicht durch breite
Scan-Ausnahmen verdecken.

Sicherheitsberichte sollen keine Bankexporte, privaten Schlüssel, Verbindungsschlüssel,
aktiven Rückleitungscodes oder vollständigen privaten Home-Assistant-Adressen enthalten.
