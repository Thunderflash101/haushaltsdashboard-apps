# Änderungen

## 0.4.1

- Hinweise zur Prognose kompakt zusammengefasst, Details standardmäßig eingeklappt.
- Direkte Aktionen für Kontostand, Fixkostentermine, Budgets und Einkommenspläne.
- Fehlende Fixkostentermine direkt aus einem Hinweis bearbeiten.
- Verfügbarer Betrag bei offenen Hinweisen als „Vorläufig frei“ gekennzeichnet.
- Keine automatische Änderung vorhandener Finanzdaten oder Planwerte.

## 0.4.0

- Neuer Bereich „Planung“: Kontostandsprognose für 30, 60 oder 90 Tage mit anklickbaren Tagesständen.
- „Rechnerisch frei“ bis vor dem nächsten geplanten regelmäßigen Kontoeingang, einschließlich geschütztem Guthaben und Sicherheitspuffer.
- Ausgangspunkt: gebuchter Bankkontostand (ITBD/CLBD) oder manuell eingetragener Kontostand mit Stichtag.
- Offene Fixkosten, einmalige Zahlungen und verbleibende Kategoriebudgets; bereits gebuchte Zahlungen werden abgeglichen.
- Einkommenspläne mit festen Beträgen oder monatlichem Netto einer Person; zukünftige Monatsnettos direkt eintragbar.
- Fehlende Monatsnettos sind erkennbare Schätzungen und standardmäßig aus der Prognose ausgeschlossen.
- Keine automatische Annahme, dass das Einkommen einer zweiten Person auf das Haushaltskonto fließt.
- Einmalige Planposten und „Nicht mehr erwarten“ ohne Veränderung echter Buchungen.
- Zusätzliche Rechen-, Speicher- und Browsertests mit synthetischen Daten.

Reguläres Update derselben App. Rückleitungs-Integration weiterhin 0.2.0.

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
