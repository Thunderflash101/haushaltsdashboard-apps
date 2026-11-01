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

## Kontostandsprognose (ab 0.4.0)

Unter **Planung** einen Zeitraum von 30, 60 oder 90 Tagen wählen. Die Kurve zeigt
Tagesendstände ab heute. Ein Tag ist über den Regler oder einen Kurvenpunkt
auswählbar; darunter stehen seine geplanten Ein- und Ausgänge.

### Kontostand als Ausgangspunkt

Ein gebuchter EUR-Saldo des verbundenen Haushaltskontos (ITBD oder CLBD) wird
übernommen. Verfügbare Salden mit Kreditrahmen/Vormerkungen werden nicht als
gebuchtes Guthaben verwendet. Liefert die Bank keinen geeigneten Saldo, unter
„Kontostand und Planung einstellen“ den Stand manuell hinterlegen. Er muss
alle bereits gebuchten Zahlungen des gewählten Stichtags enthalten. Danach
importierte Buchungen mit späterem Buchungsdatum werden hinzugerechnet;
Buchungen am Stichtag werden nicht nochmals gezählt.

Bei einem alten Saldo oder fehlendem Bank-Stichtag wird darauf hingewiesen.
Nicht importierte Umsätze und noch nicht gebuchte Kartenvormerkungen sind
unbekannt. Für eine aktuelle Prognose zuerst die Bankdaten aktualisieren.
Die Planung bezieht sich ausschließlich auf das verbundene Haushaltskonto;
Buchungen anderer ausdrücklich gekennzeichneter Konten sind ausgeschlossen.

### Was „Rechnerisch frei“ bedeutet

Verwendet wird der niedrigste geplante Kontostand vom Start bis zum Tag vor
dem nächsten eingeplanten regelmäßigen Eingang. Ohne solchen Eingang im
Prognosezeitraum gilt das Monatsende. Davon werden geschütztes Guthaben und
Sicherheitspuffer abgezogen. Negative Werte zeigen einen geplanten Fehlbetrag.
Die Kurve selbst zeigt den Kontostand, nicht dieses bereinigte Guthaben.

Geschütztes Guthaben ist Geld, das tatsächlich auf diesem Konto liegt und
im Prognosezeitraum liegen bleiben soll. Rücklagen auf anderen Konten und
Geld für hier bereits eingeplante Rechnungen nicht nochmals eintragen. Die
bestehende Rücklagenliste wird deshalb nicht pauschal vom Kontostand abgezogen.

### Fixkosten und Budgets

Fixkosten werden aus der bestehenden Liste übernommen. Bei Jahres-/Quartalskosten
muss dort der Fälligkeitsmonat festgelegt sein. Fehlt nur der Tag, wird er aus
vergangenen Buchungen geschätzt, ersatzweise auf das Monatsende gesetzt. Diese
Termine sind gekennzeichnet. Posten ohne planbaren Rhythmus/Fälligkeitsmonat
werden ausdrücklich als fehlend angezeigt.

Der Abgleich sucht passende Buchungsteile nach Betrag, Datum und Suchtext bzw.
eindeutiger Fixkostenkategorie. Eine Buchung kann nur einen Planposten erfüllen.
Mehrdeutige Treffer und deutliche Betragsabweichungen bleiben offen. Erkannte
Zahlungen stehen als „Bereits gebucht“ in der Liste und werden nicht erneut
als zukünftiger Kontoabgang eingerechnet. Offene Ausgaben mit vergangenem
Fälligkeitstag bleiben vorsichtshalber ab heute eingeplant.

Restbudget = Monatsbudget minus gebuchte Konsumkosten minus noch geplante
Konsumausgaben derselben Kategorie. Der Betrag ist mindestens null und wird
centgenau auf die verbleibenden Kalendertage verteilt. Erstattungsüberschüsse
erhöhen diesen Planbetrag nicht über das ursprüngliche Monatsbudget hinaus.
So werden Fixkosten innerhalb eines Kategorienbudgets nicht doppelt abgezogen.
Unbudgetierte flexible Ausgaben sind nur mit ausdrücklich geplanten Einmalposten
enthalten; bekannte Kategorien ohne Budget werden genannt.

### Monatlich unterschiedliches Einkommen

Einen Einkommensplan nur anlegen, wenn das Geld auf dieses Konto fließt. Für
jede Person kann der Betrag aus ihren gespeicherten Monatsnettos stammen.
Unter „Monatsnetto für kommende Monate“ lassen sich diese Werte bearbeiten.
Eine leere Zelle bedeutet unbekannt, 0 € bedeutet ausdrücklich kein Einkommen.
Die Werte werden gemeinsam mit der bestehenden Fixkostenaufteilung gespeichert.

Fehlt ein Monatsnetto, wird der Standardbetrag als Schätzung angeboten und
nur mit aktivierter Option „Geschätztes Einkommen … einbeziehen“ gerechnet.
Ein regelmäßiger Eingang ohne solche Monatsbindung verwendet den festen
Planbetrag. Bereits gebuchte Eingänge werden anhand des Zahlungsbeteiligten
und Betrags erkannt. Überfällige, noch nicht eingegangene Einnahmen werden
nicht als künftiges Guthaben gerechnet.

### Einmalposten und Korrekturen

Einmalige Beträge mit Vorzeichen, Datum und Kategorie eintragen. Ein Suchtext
erlaubt den späteren Abgleich mit dem tatsächlichen Umsatz. Ohne Suchtext
muss der Posten nach Zahlung über „Nicht mehr erwarten“ aus der Prognose
genommen werden. Diese Entscheidung lässt sich umkehren. Es entstehen keine
echten Buchungen durch das Planen. Änderungen an Einkommens- und Einmalplänen
sind durch Entfernen und erneutes Anlegen möglich.

### Update von 0.3.0

HA-App-Sicherung erstellen, dieselbe Repository-App auf 0.4.0 aktualisieren und
geöffnete Dashboard-Seiten neu laden. Die Bankverbindung und vorhandenen Daten
bleiben erhalten. Für dieses Update keine neue Rückleitungs-Integration installieren.
