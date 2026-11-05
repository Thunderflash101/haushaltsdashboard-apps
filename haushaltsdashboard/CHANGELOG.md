# Änderungen

## 0.10.0

- Darstellung wählen: Automatisch, Hell oder Dunkel, im Dashboard und auf der Bankseite.
- Auswahl pro Browser speichern; automatische Anpassung an das erkennbare Home-Assistant-Farbschema, sonst an die Geräteeinstellung.
- Dunkle Karten, Tabellen, Formulare, Buchungsdetails und Diagramme mit lesbaren Beschriftungen.
- Darstellung ändert keine Finanzdaten oder Berechnungen.

## 0.9.0

- Hauptbudget auf das Konto der ersten Person ausrichten: eigenes Netto plus tatsächliche Eingänge statt Summe beider Nettoeinkommen.
- Zweites Netto nur für die proportionale Kostenaufteilung verwenden; kein fiktiver Eingang oder Vorschuss des Soll-Anteils.
- Kostenbeteiligungen in den Buchungsdetails und in der Buchungsart zuordnen.
- Optional den vollständigen Absendernamen für vorhandene unzugeordnete und neue Importbuchungen merken; Einzel-Ausnahmen bleiben erhalten.
- Soll-Anteil, eingegangene Beteiligung, offenen Betrag und Mehrzahlung separat anzeigen.
- Eigene Umbuchungen, Erstattungen und bereits berücksichtigtes Gehalt nicht als zusätzliches Einkommen doppelt zählen.
- Private Pläne der zweiten Person nicht als eigene Kontoabgänge planen; tatsächliche Zahlungen für sie bleiben berücksichtigt.

## 0.8.0

- Keine Tagesverteilung flexibler Monatskosten mehr: Kurve und Tagesdetails enthalten nur Terminzahlungen.
- Separate Budgetkarten unter Planung mit Monatswert, Verbrauch, Rest, Fortschrittsbalken und Überschreitungen.
- Details mit monatlichem Säulendiagramm, Berechnungsgrundlage und anklickbaren Buchungen.
- Eigene Kategorienbudgets direkt in Planung anlegen, ändern oder entfernen.
- Automatische flexible Durchschnittswerte und eigene Kategorie-Limits getrennt kennzeichnen.
- Zugeordnete Erstattungen auch in den historischen flexiblen Durchschnitt einrechnen.
- Bestehende Budgets behalten ihren Bezug auf die gesamte Kategorie; Fixkosten und Terminposten werden einmal berücksichtigt.
- Monatsbudget nach Verpflichtungen und persönliche Kostenzuordnungen bleiben erhalten.

## Repository-Pflege (ohne neue App-Version)

- Sicherheitsregressionen für Zugriffsschutz, Geheimnisse, Dateirechte und Datenhaltung.
- Gitleaks-Prüfung der Git-Historie mit verifiziertem Werkzeug und Erkennungs-/Maskierungskontrolle.
- Dependabot für GitHub Actions und Docker; Actions auf Commit-SHAs festgelegt.
- Optionale Pre-commit-Hooks, CI-Statusanzeigen und aktualisierte Sicherheits-/Update-Dokumentation.
- Die installierbare App bleibt 0.7.0; dieses Paket erfordert kein NUC-Update.

## 0.7.0

- Monatsbudget aus Nettoeinkommen minus Verträgen und Fixkosten; keine Reservierung geschätzter flexibler Ausgaben.
- „Davon noch übrig“ berücksichtigt bereits importierte flexible Ausgaben und Anlagen.
- Kostenzuordnung „Gemeinsam“, „Nur Person 1“ oder „Nur Person 2“ für Verträge und Fixkosten.
- Persönliche Monatsbudgets nach eigenem Einkommen, anteiligen gemeinsamen und eigenen Verpflichtungen.
- Verträge unabhängig von der Kostenzuordnung in der Fixkostenliste ein- oder ausblenden.
- Verknüpfte Verträge und Fixkosten werden einmal berücksichtigt. Quartals- und Jahreszahlungen zählen mit Monatsanteilen.
- Monatsnetto direkt in der Budgetansicht bearbeiten; fehlende Einkommen werden nicht als 0 € angenommen.
- Kontostandsprognose und Bankeingänge bleiben unabhängig von der Budgetrechnung.

## 0.6.1

- Vollständiger Verwendungszweck über „Zweck ansehen“ auch am Handy lesbar und kopierbar.
- Bei üblichen PayPal-Referenzpräfixen Händlertext zuerst anzeigen; Rohdaten bleiben unverändert.
- Buchungen direkt mit einem bestehenden oder neu angelegten Vertrag verknüpfen.
- Manueller Zuordnungsmodus für Verträge ohne eindeutigen Händlertext.
- Allgemeine PayPal-Suchbegriffe ordnen nicht pauschal alle PayPal-Zahlungen einem Vertrag zu.
- Explizite Vertragslinks bleiben beim Import erhalten und verhindern doppeltes Einplanen.
- Kompaktere Aktionsspalte in der Buchungstabelle.

## 0.6.0

- Neuer Bereich „Verträge“ mit Monats-/Jahreskosten, Suche und Filtern.
- Vorhandene Fixkosten und erkannte regelmäßige Zahlungen als Vertragsvorlage übernehmen.
- Anbieter, Vertragsnummer, Zahlbetrag, Rhythmus, Laufzeit und Kündigungsangaben pflegen.
- Fristen aus eigenen Angaben oder exaktem Datum; Hinweise auch in der Übersicht.
- Preisverlauf aus passenden Abbuchungen, Abweichung zum gespeicherten Betrag und Übernahme des letzten Zahlbetrags.
- Kalenderexport für Fristen mit lokaler Erinnerung.
- Verträge ersetzen verknüpfte Fixkosten in Prognose und Aufteilung; kein doppelter Ansatz.
- Gekündigte Verträge bis zum Enddatum einplanen, beendete Verträge archivieren.
- Keine Kündigung wird versendet; bestehende Buchungen bleiben erhalten.

## 0.5.1

- Eigener Monatsrahmen: gebuchte plus erwartete Monatseinnahmen minus gesamte geschätzte Monatskosten.
- Unabhängig von Anfangsguthaben, geschütztem Guthaben und Liquiditätspuffer.
- Fixkosten, flexible Kosten, Anlagen/Überträge sowie gebuchte/offene Beträge getrennt nachvollziehbar.
- Übersicht zeigt den freien Monatsrahmen; Kontostandsprognose bleibt zusätzlich vorhanden.
- Roadmap mit erledigten und noch offenen Erweiterungen dokumentiert.

## 0.5.0

- Automatisches Lernen aus der lokalen Buchungshistorie, standardmäßig aktiv und abschaltbar.
- Fehlende Zahlungsrhythmen, Fälligkeitsmonate und Termine vorhandener Fixkosten aus wiederkehrenden Abbuchungen ableiten.
- Regelmäßige Vertragsabbuchungen und Gehaltseingänge automatisch in der Prognose berücksichtigen.
- Flexible Monatskosten aus bis zu sechs vergangenen Vergleichsmonaten schätzen; laufenden Monat und ersten Importmonat auslassen.
- Seltene Händlerausgaben aus allgemeinen Kategorien ausschließen und große Monatsausreißer begrenzen.
- Manuelle Budgets, Termine und Einkommenspläne behalten Vorrang.
- Erklärung mit Quellbuchungen, Vergleichsmonaten, Schätzwert und Erkennungsstufe.
- Muster ausschließbar; einzelne Buchungen als einmalig vom Lernen ausnehmen.
- Zusätzliche Algorithmus- und Browserprüfungen mit synthetischen Daten.

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
