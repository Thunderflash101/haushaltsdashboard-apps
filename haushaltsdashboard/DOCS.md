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

