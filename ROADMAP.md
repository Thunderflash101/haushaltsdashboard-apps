# Weiterentwicklung

## Bereits umgesetzt

- CSV- und Bankimport mit Dublettenabgleich und Prüfung unklarer Überschneidungen.
- Eigene Kategorien und Regeln, Teilbuchungen, Erstattungen und Umbuchungen.
- Fix-/Flexkosten, Monatsanalyse, Kategorienvergleich über zwölf Monate.
- Monatliche Nettoeinkommen und proportionale Aufteilung gemeinsamer Verpflichtungen.
- Persönliche Kostenzuordnung für Verträge und Fixkosten; persönliche Monatsbudgets.
- Verträge unabhängig von der Kostenzuordnung in der Fixkostenliste ein-/ausblenden.
- Kategoriebudgets und einfache Rücklagen mit Zielbetrag/Zielmonat.
- Kontostandsprognose aus Zahlungen mit Termin; flexible Monatswerte separat statt täglicher Schätzbuchungen.
- Budgetkarten mit Verbrauch, Rest, Überschreitungen, Monatsdiagramm und Buchungsdetails.
- Automatische Erkennung von Rhythmen, Gehalt und flexiblen Kosten.
- Monatsbudget aus Netto minus Verträgen und Fixkosten, ohne flexible Schätzungen.
- Verbleibendes Budget nach tatsächlich importierten flexiblen Ausgaben und Anlagen.
- Vertragsverwaltung mit Vorlagen, Preisänderungen, Laufzeiten, Fristen und Kalenderexport.

## Technische Verbesserungen

### Im Repository eingerichtet

- Dauerhafte Sicherheitsregressionen für Zugriffsschutz und sichere Datenhaltung.
- Gitleaks mit vollständiger Git-Historie und Kontrolltest für Erkennung/Maskierung.
- Wöchentliche Dependabot-Vorschläge für GitHub Actions und Docker-Basisimage.
- GitHub Actions auf Commit-SHAs festgelegt; optionale Pre-commit-Hooks.
- CI-Statusanzeigen und klare Trennung von Migration und regulärem Update.

### Noch offen

1. Optionale passwortverschlüsselte Finanzsicherung mit getesteter Wiederherstellung.
2. Protokoll-/Versionsabgleich der Bankrückleitung, echte HA-Framework-Tests,
   hassfest und HACS-Unterstützung für die separate Integration.
3. Vorgebaute amd64-Images über GHCR, festgelegte Basisimage-Digests und Release-Ablauf.
4. Geregelte Datenmigrationen vor einer inkompatiblen Schemaänderung; Linting und Coverage.
5. Lizenzentscheidung, Repository-Beschreibung/Topics und veröffentlichte Releases.

## Weitere Funktionen

1. **Gemeinsame Haushaltsabrechnung:** zusätzlich zu den vorhandenen Kostenträgern
   erfassen, wer bezahlt hat, sowie Soll-/Ist-Anteile und monatlichen Ausgleich berechnen.
2. **Vertragsverwaltung weiter ausbauen:** externe Benachrichtigungen, Dokumentverknüpfung
   und feinere Zuordnung mehrerer Verträge bei einem Anbieter. Die Grundverwaltung ist seit 0.6.0 verfügbar.
3. **Sparziele und Rücklagen erweitern:** Fortschritt, übertragbare Budgetreste,
   tatsächliches Sparguthaben und klare Zuordnung geplanter Jahresrechnungen.
4. **Vermögen und Kredite:** Depot-/ETF-Werte, Restschulden, Zins-/Tilgungsanteile
   und Szenarien für zusätzliche Tilgung. Eigener Import kann notwendig sein.
5. **Mehrere Konten:** getrennte Konten und Salden, zuverlässige interne Überträge,
   gemeinsame Gesamtsicht. Die automatische Bankanbindung unterstützt derzeit ein Haushaltskonto.
6. **Home-Assistant-Hinweise:** Budgetgrenzen, ablaufende Bankfreigabe und Abruffehler.
7. **Änderungsverlauf:** einzelne Änderungen und Importe nachvollziehen und gezielt zurücknehmen.

Die Reihenfolge ist eine Arbeitsplanung. Noch offene Punkte werden hier ausdrücklich
nicht als bereits verfügbare Funktionen geführt.
