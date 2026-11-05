# Haushaltsdashboard für Home Assistant

[![App-Prüfungen](https://github.com/Thunderflash101/haushaltsdashboard-apps/actions/workflows/check.yml/badge.svg?branch=main)](https://github.com/Thunderflash101/haushaltsdashboard-apps/actions/workflows/check.yml)
[![Sicherheitsprüfungen](https://github.com/Thunderflash101/haushaltsdashboard-apps/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/Thunderflash101/haushaltsdashboard-apps/actions/workflows/security.yml)

Eine private Haushaltsauswertung mit Monatsansicht, Kategorien, Fixkosten,
variablen Kosten, proportionaler Kostenaufteilung und Enable-Banking-Import.

**Version 0.9.0 – Eigenes Kontobudget mit tatsächlich eingegangenen Kostenbeteiligungen.**

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

Der NUC baut die App beim Installieren und Aktualisieren selbst. Derzeit
werden keine vorgefertigten Images oder Registry-Zugangsdaten benötigt.
Die Repository-URL bleibt nach der Einrichtung stabil.

## Funktionen

- Gemeinsame Daten auf dem NUC, Zugriff über Home Assistant Ingress.
- Automatische Erkennung von Rhythmen, Gehalt und typischen flexiblen Kosten mit nachvollziehbaren Quellen.
- Kontostandsprognose für 30/60/90 Tage ausschließlich mit Zahlungen mit Termin.
- Separate Budgetkarten mit Fortschrittsbalken, verbleibendem Monatsrahmen,
  Monatsvergleich und anklickbaren Buchungen; keine verteilten Tagesdurchschnitte.
- Eigene Budgetlimits und automatische flexible Durchschnittswerte klar getrennt.
- Zeitliche Kontodeckung bis zum nächsten regelmäßigen Eingang; geschütztes Guthaben und Puffer.
- Einkommenspläne mit monatlich unterschiedlichen Nettowerten und Einmalposten.
- Einnahmen, Kontoabgänge, Fix- und Flexkosten pro Monat.
- Eigenes Monatsbudget aus eigenem Netto plus eingegangenen Kostenbeteiligungen und
  weiteren Einnahmen minus gemeinsamen und eigenen Verpflichtungen.
- Das zweite Netto dient ausschließlich der Aufteilung; Soll, Ist und offener Anteil
  werden getrennt angezeigt. Absender können ausdrücklich für Folgeimporte gemerkt werden.
- Persönliche Verpflichtungen und einkommensabhängige Aufteilung gemeinsamer Kosten.
- Separat: verbleibendes Budget nach bereits importierten flexiblen Ausgaben und Anlagen.
- Monatliche Einkommen zweier Personen, direkt im Budget bearbeitbar.
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
5. Erst nach erfolgreichen App- und Sicherheitsprüfungen in `main` übernehmen.
   `main` ist der Installationsbranch; Feature-Branches dienen der Entwicklung.
6. Home Assistant bietet anschließend die neue App-Version als Update an.

Bei regulären Updates derselben Repository-App bleibt `/data` erhalten. Ein
Wechsel von der lokalen App oder von einer anderen Repository-URL ist eine
separate Installation und benötigt die dokumentierte Migration.

## Prüfung dieses Standes

Erfolgreich lokal ausgeführt:

- Node-Tests: Bank-Signatur, Callback-Zustand, Dubletten, Seitenabruf,
  CSV-Überschneidungen, leere Ersteinrichtung, JSON-Datenübernahme,
  konfigurierbare Verbindung, Benutzerrechte und Datenerhalt nach Neustart,
  Teilbuchungen, Erstattungen, Umbuchungen, zeitlich passende Monatsvergleiche
  und Prognosen mit Kontostand, Zahlungen, Budgets und fehlenden Einkommenswerten.
- Fokussierte Python-Tests: zulässige interne Ziele, Webhook-Validierung und
  Aktualisieren des vorhandenen Integrationseintrags beim Umstellen.
- Sicherheitsregressionen: Ingress-Absender, Benutzerfreigaben, Besitzerrechte,
  interne Rückleitung, Geheimnisschutz, Dateirechte, Revisionskonflikte und
  fehlgeschlagene atomare Speicherung.
- JavaScript-/Python-Syntax und Privacy-Audit.

Der [GitHub-Workflow](https://github.com/Thunderflash101/haushaltsdashboard-apps/actions)
prüft außerdem den Container-Bau und mit Playwright die Browserabläufe: Aufteilen,
Erstattung, Umbuchung, Fixkostenabgleich, Monatsvergleich, Prognoseeingaben, zukünftige Monatsnettos und Mobilbreiten 360/390 px.
Die zugehörigen Screenshots enthalten ausschließlich synthetische Testdaten.

Die bestehende Installation wurde vom Betreiber als funktionsfähig bestätigt.
Jede neue Version muss nach dem Update zusätzlich auf dem eigenen HA-Gerät geprüft
werden. Die Python-Tests ersetzen keinen vollständigen Home-Assistant-Core-Test.

## Sicherheitsprüfungen und Abhängigkeiten

Der Workflow **Security checks** lädt eine festgelegte Gitleaks-Version und prüft
die SHA-256-Prüfsumme des offiziellen Release-Archivs. Er testet die Erkennung
und Maskierung mit einem künstlichen, nie ausgegebenen Testtoken und prüft danach
die vollständig ausgecheckte Git-Historie. Das läuft bei Pushes und Pull Requests,
wöchentlich und bei manuellem Start. Der Privacy-Audit läuft zusätzlich.

GitHub Actions sind auf Commit-SHAs festgelegt. Dependabot prüft wöchentlich
GitHub Actions und das Docker-Basisimage und erstellt Änderungsvorschläge als
Pull Requests. Diese werden nicht automatisch übernommen. Die laufende Node-App
hat keine externen npm-Abhängigkeiten; Playwright ist ein getrenntes Testwerkzeug.
Das Docker-Basisimage verwendet weiterhin den Tag `node:24-alpine`; eine
Digest-Festlegung und vorgebaute Images gehören zum geplanten Build-Paket.

Optional lassen sich die Prüfungen vor lokalen Commits installieren:

```sh
python3 -m pip install pre-commit
pre-commit install
pre-commit run --all-files
```

Der Gitleaks-Hook ist auf den überprüften Upstream-Commit festgelegt und baut das
Go-Werkzeug bei der Ersteinrichtung. Dafür sind Netzwerkzugriff und eine passende
Go-Umgebung erforderlich. Der lokale Privacy-Hook benötigt `python3`. CI führt
die Prüfungen unabhängig von lokal installierten Hooks aus.

Weitere Details und Grenzen stehen in [SECURITY.md](SECURITY.md).

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

