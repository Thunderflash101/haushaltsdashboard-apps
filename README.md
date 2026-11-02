# Haushaltsdashboard für Home Assistant

Eine private Haushaltsauswertung mit Monatsansicht, Kategorien, Fixkosten,
variablen Kosten, proportionaler Kostenaufteilung und Enable-Banking-Import.

**Version 0.7.0 – Monatsbudget nach Verpflichtungen und persönliche Kostenzuordnung.**

Der Programmcode enthält keine persönlichen Buchungen, Kontonummern oder
Anwendungsschlüssel. Die App startet leer. Jeder Betreiber hinterlegt seine
eigene Enable-Banking-Anwendung und Bankfreigabe ausschließlich auf dem eigenen
Home-Assistant-Gerät. Unterstützt werden ein deutsches EUR-Haushaltskonto und
die zugehörige private Haushaltsauswertung.

## Installation

1. Dieses Repository unter **Einstellungen → Apps → App installieren → ⋮ →
   Repositorys** hinzufügen.
2. **Haushaltsdashboard** aus dem Bereich **Haushaltsdashboard Apps** installieren.
3. App starten und die Weboberfläche über Home Assistant öffnen.
4. Der Anleitung in [MIGRATION.md](MIGRATION.md) folgen, wenn bereits die lokale
   Version verwendet wird. Für eine neue Einrichtung siehe
   [haushaltsdashboard/DOCS.md](haushaltsdashboard/DOCS.md).

Vorgesehene Repository-URL:

```
https://github.com/Thunderflash101/haushaltsdashboard-apps
```

Der NUC baut die App beim Installieren und Aktualisieren selbst. Für diese erste
Version werden keine vorgefertigten Images oder Registry-Zugangsdaten benötigt.
Die Repository-URL bleibt nach der Einrichtung stabil.

## Funktionen

- Gemeinsame Daten auf dem NUC, Zugriff über Home Assistant Ingress.
- Automatische Erkennung von Rhythmen, Gehalt und typischen flexiblen Kosten mit nachvollziehbaren Quellen.
- Kontostandsprognose für 30/60/90 Tage mit offenen Zahlungen und Restbudgets.
- Frei verfügbar bis zum nächsten regelmäßigen Eingang; geschütztes Guthaben und Puffer.
- Einkommenspläne mit monatlich unterschiedlichen Nettowerten und Einmalposten.
- Einnahmen, Kontoabgänge, Fix- und Flexkosten pro Monat.
- Monatliche Einkommen zweier Personen und anteilige Fixkostenaufteilung.
- Eigene Kategorien, Regeln, Budgets und Rücklagen.
- Vertragsverwaltung, Preisentwicklung, Fristen und Kalenderexport.
- Monatsdiagramme und Kategorienvergleich über zwölf Monate.
- Erklärung von Mehrkosten und Entlastungen mit anklickbaren Einzelbuchungen.
- Vormonat, Vorjahr und Zwölfmonatsdurchschnitt; optionale Vergleiche bis zum gleichen Kalendertag.
- Teilbuchungen mit eigener Kategorie, Ausgabenart und Fix-/Flexstatus.
- Erstattungszuordnungen und verknüpfte Umbuchungen mit Betragsprüfung.
- CSV-Import und regelmäßiger Bankabruf über Enable Banking.
- Abgleich vorhandener Buchungen und Prüfliste für unklare Überschneidungen.
- Geschützter Zugriff für ausdrücklich freigegebene HA-Benutzer.
- JSON-Sicherungen ohne Schlüssel oder Bank-Sitzungsdaten.

Die Bank-Rückleitung wird von der zusätzlichen Integration unter
`custom_components/haushalt_bank_callback` übernommen. Diese Integration wird
einmal separat installiert. Das App-Repository aktualisiert sie nicht automatisch.
Ein öffentlich zugänglicher Programmcode bietet keinen Zugriff auf die lokale
App oder deren Daten.

## Entwicklung und Updates

Node 24 und Python 3 genügen für die Tests; externe Bankaufrufe werden simuliert:

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p '*_test.py'
python3 -m compileall -q custom_components
python3 tools/audit_repository.py
```

Vor Veröffentlichung einer Änderung:

1. Änderungen in einem Arbeitsbranch vornehmen.
2. Tests und Privacy-Audit ausführen.
3. `version` in `haushaltsdashboard/config.yaml` erhöhen und `CHANGELOG.md` ergänzen.
4. Pull Request prüfen; der GitHub-Workflow testet zusätzlich den Container-Bau.
5. Erst nach erfolgreichen Prüfungen in den Installationsbranch übernehmen.
6. Home Assistant bietet anschließend die neue App-Version als Update an.

Bei regulären Updates derselben Repository-App bleibt `/data` erhalten. Ein
Wechsel von der lokalen App oder von einer anderen Repository-URL ist eine
separate Installation und benötigt die dokumentierte Migration.

## Prüfung dieses Standes

Erfolgreich lokal ausgeführt:

- 101 Node-Tests: Bank-Signatur, Callback-Zustand, Dubletten, Seitenabruf,
  CSV-Überschneidungen, leere Ersteinrichtung, JSON-Datenübernahme,
  konfigurierbare Verbindung, Benutzerrechte und Datenerhalt nach Neustart,
  Teilbuchungen, Erstattungen, Umbuchungen, zeitlich passende Monatsvergleiche
  und Prognosen mit Kontostand, Zahlungen, Budgets und fehlenden Einkommenswerten.
- 3 fokussierte Python-Tests: zulässige interne Ziele, Webhook-Validierung und
  Aktualisieren des vorhandenen Integrationseintrags beim Umstellen.
- JavaScript-/Python-Syntax und Privacy-Audit.

Der [GitHub-Workflow](https://github.com/Thunderflash101/haushaltsdashboard-apps/actions)
prüft außerdem den Container-Bau und mit Playwright die Browserabläufe: Aufteilen,
Erstattung, Umbuchung, Fixkostenabgleich, Monatsvergleich, Prognoseeingaben, zukünftige Monatsnettos und Mobilbreiten 360/390 px.
Die zugehörigen Screenshots enthalten ausschließlich synthetische Testdaten.

Die bestehende Installation wurde vom Betreiber als funktionsfähig bestätigt.
Jede neue Version muss nach dem Update zusätzlich auf dem eigenen HA-Gerät geprüft
werden. Die Python-Tests ersetzen keinen vollständigen Home-Assistant-Core-Test.

## Daten und Sicherheit

Schlüssel, API-Sitzung und Finanzen liegen im privaten `/data`-Verzeichnis der
App. Dieses Verzeichnis gehört niemals in Git. Auch Bankexporte, persönliche
JSON-Sicherungen und die lokale frühere App-Version gehören nicht in dieses
Repository. Die Ignore-Dateien und der Privacy-Audit unterstützen diese Trennung.

Home-Assistant-App-Sicherungen enthalten auch sensible App-Daten; entsprechend
geschützte bzw. verschlüsselte Sicherungen verwenden. Die App-Konfiguration nutzt
kalte Sicherungen, damit die App während einer HA-Sicherung angehalten wird.

## Technische Quellen

- https://contributors.home-assistant.io/apps/guides/repository/
- https://contributors.home-assistant.io/apps/how-apps-work/
- https://contributors.home-assistant.io/apps/guides/ingress/
- https://contributors.home-assistant.io/core/integrations/reauth-reconfigure/
- https://enablebanking.com/docs/api/reference/

