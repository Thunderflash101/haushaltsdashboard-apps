# Änderungen

## 0.3.0

- Monatsanalyse „Warum war dieser Monat teuer?“ mit Vormonat, Vorjahr und Durchschnitt der vorherigen zwölf Kalendermonate.
- Anklickbare Kostentreiber und Entlastungen mit aktuellen und früheren Einzelbuchungen.
- Fehlende Monate bleiben fehlend; unvollständige Monate können bis zum gleichen Buchungstag verglichen werden.
- Teilbuchungen mit eigenem Fix-/Flexstatus, konsistent in Monatszahlen, Budgets und Fixkostenabgleich.
- Erstattungen ganz oder teilweise einer Originalbuchung und deren Kategorien zuordnen; Schutz vor Übererstattung.
- Erstattungen senken die Konsumausgaben im Monat des Geldeingangs. Der Kontosaldo und rohe Kontoabgänge bleiben unverändert.
- Gegenbuchungen von Umbuchungen verknüpfen; Anlagen und eingehende Umbuchungen von Konsum bzw. Einkommen unterscheiden.
- Alle Zuordnungen lassen sich lösen. Bestehende Buchungen werden dabei nicht gelöscht.
- Gemeinsame Rechen- und Validierungslogik für Browser und Server sowie zusätzliche Finanz- und Browsertests.

Reguläres Update derselben App. Die Rückleitungs-Integration bleibt bei 0.2.0;
Bankverbindung und Daten müssen nicht neu eingerichtet werden.

## 0.2.0

- Erste für ein App-Repository vorbereitete Version.
- Persönliche Startbuchungen und Kontonummern aus dem Programm entfernt.
- Application ID, Rücksprungadresse und Haushaltskonto lokal konfigurierbar.
- Anzeigenamen für die beiden Personen einstellbar.
- Bestehende Finanz-JSONs weiterhin importierbar.
- Prüfziffernkontrolle der eingegebenen IBAN.
- Genauere Prüfung der freigegebenen HA-Benutzerkennungen.
- Kalte HA-App-Sicherungen.
- Automatische Tests, Privacy-Audit und Container-Bau als GitHub-Workflow.

Die separat installierte Rückleitungs-Integration 0.2.0 kann auf eine andere
interne App-Adresse umgestellt werden. Sie muss bei der Migration aktualisiert
werden. Die lokale App wird nicht automatisch in die Repository-App umgewandelt.
