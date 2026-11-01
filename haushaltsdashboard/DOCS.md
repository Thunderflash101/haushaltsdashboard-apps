# Einrichtung

Die App startet ohne persönliche Daten. Zugriff ausschließlich über die
Home-Assistant-Weboberfläche (Ingress). Der erste bestätigte HA-Benutzer wird
Besitzer. Weitere Benutzer müssen von ihm ausdrücklich freigegeben werden.

## Schrittfolge

1. Vorhandene JSON-Sicherung im Dashboard importieren und Datenübernahme bestätigen.
2. Application ID, registrierte HTTPS-Rücksprungadresse mit `/api/webhook/<lange-id>`
   und die Haushaltskonto-IBAN eintragen und speichern.
3. Privaten PEM-Schlüssel direkt in der App hinterlegen und prüfen.
4. Zusätzliche Integration `haushalt_bank_callback` separat installieren bzw.
   aktualisieren und auf die interne Adresse dieser App konfigurieren.
5. Den in der App angezeigten Verbindungsschlüssel in der Integration eintragen.
6. Genaue Bank auswählen, Freigabe durchführen, ein EUR-Haushaltskonto wählen.
7. Ersten Import und mögliche Überschneidungen prüfen.

Bei der neuen Installation einer noch nicht vorhandenen Haushaltsauswertung kann
die leere Datenbasis bestätigt werden. Die ersten Bankumsätze oder CSV-Buchungen
füllen anschließend die Monatsansichten.

Eine Production-Anwendung bei Enable Banking wird über das Verknüpfen eigener
Konten aktiviert. Zusätzlich benötigt diese App ihre eigene API-Freigabe.
Der private Schlüssel, Bank-PINs und TANs gehören niemals in Git oder in einen Chat.

## Daten

Das private `/data` enthält Finanzen, Konfiguration und Bank-Sitzung. Es bleibt
bei Updates derselben App erhalten. JSON-Sicherungen aus dem Dashboard enthalten
Finanzen, Kategorien und Monatswerte, aber keine PEM-Schlüssel, Sitzungen oder
Benutzerfreigaben. Anzeigenamen können in der App angepasst werden.

## Automatische Abrufe

Standardmäßig alle 12 Stunden, umstellbar auf 24 Stunden. Nur gebuchte EUR-Umsätze
werden übernommen. Spätere Abrufe überschneiden sich um 14 Tage. Die von der Bank
verfügbare Historie kann kürzer als der gewünschte Abrufzeitraum sein. Freigaben
laufen ab und müssen dann erneuert werden.

Nicht eindeutig abgleichbare Buchungen werden in einer Prüfliste zurückgehalten.
Manuelle Kategorien und Fixkostenentscheidungen bleiben beim Bankimport erhalten.

Für den Wechsel von der lokalen App unbedingt die Anleitung `MIGRATION.md` im
Repository verwenden. Persönliche Datenschutz-/Nutzungsseiten werden außerhalb
dieses Repositorys auf der eigenen Installation gepflegt.


## Ausgaben verstehen (ab 0.3.0)

### Monatsvergleich

Unter **Monate → Warum war dieser Monat teuer?** Vormonat, Vorjahresmonat oder
den Durchschnitt der vorherigen zwölf Kalendermonate wählen. Ein Klick auf eine
Kategorie zeigt die Einzelbuchungen beider Zeiträume. Fehlende Monate gehen nicht
als Null in den Durchschnitt ein; die berücksichtigten Monate werden genannt.
Ein Monat mit importierten Buchungen ist kein Nachweis für vollständige Daten.
Bei einem laufenden oder am Ende unvollständig importierten Monat ist der
Vergleich bis zum gleichen Kalendertag voreingestellt.

### Aufteilen

Unter **Buchungen → Aufteilen** mindestens zwei positive Teilbeträge mit
Kategorie, Art und Fix-/Flexstatus eintragen. Die Summe muss centgenau dem
Kontoabgang entsprechen. Die ursprüngliche Buchung bleibt einmal erhalten.
Beispiel: 100 € Einkauf → 60 € Lebensmittel flexibel und 40 € Abo fix.

### Erstattungen

Den **positiven Geldeingang → Zuordnen → Erstattung** öffnen, die ursprüngliche
Abbuchung suchen und wählen. Bei aufgeteilten Käufen die Erstattung auf die
ursprünglichen Kategorien verteilen. Mehrere Teil-Erstattungen sind möglich,
insgesamt höchstens bis zum ursprünglichen Betrag pro Kategorie/Art/Status.
Eine Gutschrift kann genau einer ursprünglichen Abbuchung zugeordnet werden;
Sammelerstattungen für mehrere Abbuchungen werden noch nicht unterstützt.

In der Konsumansicht sinken die Kosten **im Monat des Geldeingangs**. Die ursprüngliche
Ausgabe wird nicht rückwirkend geändert. In der Kontoansicht bleibt die Erstattung
ein Geldeingang. Negative Nettokosten sind zulässig, etwa bei Rückzahlungen für
Käufe aus dem Vormonat. Kreisanteile beziehen sich auf positive Nettokategorien;
Erstattungsüberschüsse stehen separat. ETFs und Umbuchungen bleiben ausgeschlossen.

Über **Zuordnung → Zuordnung lösen** wird die Verbindung aufgehoben. Vor Änderungen
an der Aufteilung einer erstatteten Originalbuchung müssen deren Erstattungen
gelöst werden. Das verhindert widersprüchliche Beträge.

### Umbuchungen und Anlagen

Die Art **Umbuchung** oder **Anlage** kann direkt in der Buchung gewählt werden,
auch bei Eingängen. Beide werden in der Konsumansicht nicht als Einkommen gezählt.
Unter **Zuordnen** können zwei gleich hohe Gegenbuchungen verknüpft werden, sofern
beide vorhanden sind. Gleiche bekannte Konten sind ausgeschlossen. Bei unbekannten
Konten ist die tatsächliche Zugehörigkeit selbst zu prüfen. Vorschläge werden
niemals ohne Bestätigung angewendet. Die Bankanbindung bleibt auf ein Haushaltskonto
begrenzt; diese Funktion fügt keine zweite automatische Bankverbindung hinzu.

### Update von 0.2.0

Vor dem Update eine HA-App-Sicherung erstellen. Dieselbe Repository-App auf 0.3.0
aktualisieren und offene Dashboard-Seiten anschließend neu laden. Buchungen,
Kategorien, Einkommen und Bankfreigabe bleiben in `/data` erhalten. Kein erneuter
Import und keine Änderung der Rückleitungs-Integration erforderlich. Für eine
Rückkehr zu einer älteren Version auch deren Datensicherung wiederherstellen, da
sie die neue Erstattungslogik nicht kennt.
