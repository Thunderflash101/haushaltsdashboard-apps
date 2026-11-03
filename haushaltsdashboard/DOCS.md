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

### Was „Nach Terminzahlungen“ bedeutet

Verwendet wird der niedrigste geplante Kontostand vom Start bis zum Tag vor
dem nächsten eingeplanten regelmäßigen Eingang. Ohne solchen Eingang im
Prognosezeitraum gilt das Monatsende. Davon werden geschütztes Guthaben und
Sicherheitspuffer abgezogen. Negative Werte zeigen einen geplanten Fehlbetrag.
Die Kurve selbst zeigt den Kontostand nach terminierten Zahlungen, nicht dieses
bereinigte Guthaben. Flexible Monatswerte sind seit 0.8.0 separat ausgewiesen und
werden hier nicht abgezogen. Der Wert ist kein frei verfügbares Einkaufsbudget.

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

Seit **0.8.0** gibt es keine erfundenen Tagesbuchungen aus Monatsbudgets oder
Durchschnittswerten mehr. Kurve, Tagesdetails, Endstand und niedrigster geplanter
Stand berücksichtigen nur die Zahlungen mit Termin. Tatsächliche Einkäufe werden
wie bisher über den gebuchten Kontostand bzw. später importierte Buchungen erfasst.

### Separate Monatsbudgets und flexible Ausgaben (ab 0.8.0)

Unter dem Verlauf zeigt **Flexible Ausgaben im Blick** Karten nach dem Prinzip
Monatswert, Verbrauch und Rest. Der Monat ist für den aktuellen Prognosezeitraum
wählbar. Suchfeld und Reiter **Budgets / Buchungen** helfen bei vielen Kategorien.

- **Dein Budget:** gespeichertes monatliches Limit für die gesamte Kategorie.
  Bereits gebuchte Konsumausgaben und offene terminierte Ausgaben dieser Kategorie
  werden abgezogen. Fixkosten innerhalb des Limits zählen dadurch einmal.
- **Automatischer Ø:** typischer flexibler Monatswert aus bis zu sechs abgeschlossenen
  Vergleichsmonaten. Fixkosten und Verträge sind ausgenommen; der gebuchte flexible
  Verbrauch wird abgezogen. Zusätzliche geplante Sonderzahlungen stehen in der Kurve.
- **Ohne Planwert:** zu wenig Vergleichsdaten oder keine regelmäßig wiederkehrenden
  Ausgaben. Der zukünftige Rest bleibt unbekannt und wird nicht als 0 € geschätzt.

Die Anzeige **Noch vorgesehen** summiert bekannte positive Restbeträge einmal pro
Monat. Kategorien ohne Planwert werden genannt. Ein überschrittener Monatswert
wird rot gezeigt, mit 0 € verbleibendem Planrahmen; es entstehen keine negativen
künftigen Zahlungen. Erstattungsüberschüsse erzeugen keinen zusätzlichen erwarteten
Verbrauch über den Monatswert hinaus. Anlagen und eigene Umbuchungen gehören
nicht in diese flexible Konsumübersicht.

Eine Karte öffnet das Monatsdiagramm mit aktueller Budget-/Ø-Linie, eine Tabelle
der Vergleichswerte sowie die zugehörigen Buchungen. Diagrammbalken oder die
Monatsauswahl filtern die Buchungsliste. Ein Klick auf eine Buchung öffnet deren
vollständigen Zweck und Vertragszuordnung. Historische Balken zeigen die tatsächlich
erfassten Ausgaben; die Linie bezeichnet den aktuell gewählten Monatswert und ist
kein historisch versioniertes Budget.

In den Details können eigene Budgets angelegt, geändert und entfernt werden.
Ein eigenes Limit gilt wie bisher für jeden Monat; die Monatsauswahl ist keine
Beschränkung einer Budgetänderung auf diesen Monat. Nach Entfernen des Limits
erscheint wieder ein automatischer Ø, sofern ausreichende Vergleichsdaten bestehen.
Die Buchungen bleiben erhalten. Die Prognoseoption **Eigene Kategoriebudgets in der
Monatsübersicht verwenden** betrifft diese Monatswerte, nicht die Kurve.

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

## Automatische Erkennung (ab 0.5.0)

Die Prognose lernt standardmäßig aus den vorhandenen lokalen Buchungen und
aktualisiert ihre Schätzungen nach jedem Import. Die Rohbuchungen, gespeicherten
Fixkosten und manuellen Budgets werden dabei nicht umgeschrieben. Unter
**Planung → Automatisch erkannt** stehen erkannte Muster, Quellen, Monatswerte
und eine qualitative Erkennungsstufe (mittel/hoch). Diese Stufe ist keine
statistische Garantie. Die Erkennung kann in den Planungseinstellungen abgeschaltet
werden. Einzelne Muster lassen sich ausschließen und später wieder zulassen.

### Rhythmen und Fälligkeit

Ähnliche Abbuchungen desselben Zahlungspartners und derselben Kategorie werden
nach Betrag und gegebenenfalls Mandatsreferenz getrennt. Regelmäßige Monatsabstände
und ähnliche Zahlungstage ergeben einen geschätzten Rhythmus (1, 2, 3, 6 oder
12 Monate). Für vorhandene bekannte Rhythmen können zwei Zahlungstermine genügen,
sonst sind mindestens drei nötig. Wiederholte Zahlungen im gleichen Monat sind
kein eindeutiger Vertragsrhythmus. Eigene Fälligkeitstage und Monate bleiben
vorrangig. Ein vorhandener normalisierter Monatsbetrag wird ebenfalls beibehalten.

Neue Fixkostenmuster werden nur bei passenden Vertragskategorien oder bereits
als sichere Fixkosten eingeordneten Buchungen verwendet. Ein Supermarkt wird
deshalb nicht allein durch wiederholte Einkäufe zum Vertrag. Lange ausgebliebene
Serien werden nicht unbegrenzt fortgeschrieben. Ausreichende Historie bleibt
notwendig: Zwei jährliche Buchungen reichen für einen unbekannten Jahresvertrag
noch nicht aus.

### Gehalt

Mindestens drei beobachtete Gehaltsmonate desselben Zahlungspartners liefern den
typischen Termin. Monatsendzahlungen werden am letzten Wochentag des Monats
angesetzt; Feiertage sind nicht berücksichtigt. Der Betrag ist der Median der
letzten drei beobachteten Monatszahlungen. Damit beeinflusst eine einzelne
Sonderzahlung die Prognose weniger. Bereits gebuchtes Gehalt wird nicht erneut
eingeplant, auch wenn sein Betrag vom Schätzwert abweicht.

Ein vorhandener manueller Einkommensplan für denselben Zahlungspartner hat Vorrang.
Automatisch gelernt wird nur aus tatsächlichen Kontoeingängen; ein manuell
eingetragenes Netto der zweiten Person erzeugt weiterhin keinen automatischen
Kontoeingang. Explizite Einkommenspläne können wie bisher auf Monatsnettos zugreifen.
Die Option für fehlende manuelle Monatsnettos ist getrennt von der automatischen
Gehaltserkennung.

### Flexible Ausgaben

Fehlt ein eigenes Kategorienbudget, können typische variable Ausgaben geschätzt
werden. Grundlage sind bis zu sechs vergangene Kalendermonate mit Buchungen.
Der erste Importmonat und der laufende Monat werden vorsichtshalber ausgelassen;
Monate ganz ohne Buchungsdaten werden nicht als Null gezählt. Mindestens zwei
Vergleichsmonate und wiederholte Ausgaben in mindestens der Hälfte der Monate
sind erforderlich. Importvollständigkeit lässt sich daraus nicht sicher beweisen.

Für Lebensmittel, Tanken und Drogerie werden die passenden flexiblen Abbuchungen
betrachtet. In anderen Kategorien zählen nur Händler mit Ausgaben in mindestens
zwei Vergleichsmonaten. Seltene Reparaturen, Reisen oder Einzelkäufe gehen dadurch
nicht pauschal in einen monatlichen Durchschnitt ein. Große Monatswerte werden
oberhalb von Median plus dem Maximum aus dreifacher Medianabweichung, halbem
Median und 20 € begrenzt. Der daraus berechnete Durchschnitt und die ursprünglichen
Monatswerte sind sichtbar. Dies ist ein Planwert und kein Ausgabenlimit.

Der automatische flexible Monatswert steht seit 0.8.0 separat in den Budgetkarten.
Er wird nicht auf Tage verteilt und verändert die Kontostandskurve nicht.
Ein eigenes Kategoriebudget hat Vorrang und umfasst die gesamte Kategorie.
Zugeordnete Erstattungen senken auch die historischen flexiblen Vergleichswerte.

Unter **Buchungen → Als einmalig markieren** können Sonderkäufe oder Sonderzahlungen
vom Lernen ausgeschlossen werden. Sie bleiben vollständig in den tatsächlichen
Monatsauswertungen und im Kontosaldo enthalten. Keine automatische Methode kann
alle Einmalereignisse oder Vertragsenden zuverlässig erkennen; die Quellen und
Korrekturmöglichkeiten sind deshalb Bestandteil der Ansicht.

## Monatsbudget nach Verpflichtungen (ab 0.7.0)

Übersicht und Planung zeigen das Budget des aktuellen Kalendermonats:

**Nettoeinkommen beider Personen − Verträge und Fixkosten = Monatsbudget.**

Geschätzte flexible Kosten, Lebensmittel-, Shopping- und andere Kategoriebudgets,
geplante Einmalposten, Kontoguthaben und Liquiditätspuffer reduzieren diesen
Ausgangswert nicht. Quartals- und Jahreszahlungen werden mit dem Monatsanteil
reserviert, unabhängig vom tatsächlichen Fälligkeitsmonat. Die Tabelle zeigt
alle enthaltenen Verpflichtungen und ihre Kostenträger.

**Davon noch übrig** zieht bereits importierte flexible Ausgaben und Anlagen
vom Monatsbudget ab. Zugeordnete Erstattungen stellen das flexible Budget wieder
her. Eigene Umbuchungen verbrauchen es nicht. Bezahlte Verträge und Fixkosten
werden nicht erneut abgezogen. Als fix markierte Buchungen ohne Planposten
werden als zusätzliche gemeinsame Verpflichtung berücksichtigt. Nicht importierte
Ausgaben, insbesondere auf einem zweiten persönlichen Konto, fehlen in dieser
Anzeige. Die persönlichen Karten zeigen deshalb jeweils das Ausgangsbudget nach
Verpflichtungen, keinen personenbezogenen Rest nach Einkäufen.

### Gemeinsam oder persönlich

Bei jedem Fixkostenposten und Vertrag **Wer trägt diese Kosten?** auswählen:

- **Gemeinsam:** Aufteilung nach den monatlichen Nettoeinkommen.
- **Nur Person 1 / Nur Person 2:** Vollständig dem persönlichen Budget zuordnen.

Die Namen entsprechen den eingerichteten Anzeigenamen. Bestehende Posten ohne
Zuordnung gelten weiterhin als gemeinsam. Persönliche Verträge deshalb einmalig
bearbeiten. **Auch in der Fixkostenliste anzeigen** steuert bei Verträgen nur die
Darstellung. Ein ausgeblendeter Vertrag bleibt in Budget und Kontostandsprognose
enthalten. Verknüpfte Fixkostenposten werden durch ihren Vertrag ersetzt und nicht
doppelt gezählt; die Kostenzuordnung des Vertrags gilt.

### Einkommen pro Monat

Die eingetragenen Monatsnettos haben Vorrang, auch ein ausdrücklich eingetragener
Wert von 0 €. Ohne Eintrag wird auf passende aktuelle Gehaltsbuchungen und danach
auf Einkommenspläne zurückgegriffen. Gehaltsbuchungen ohne personenspezifischen
Plan werden wie bisher der ersten Person zugerechnet. Für Gehalt der zweiten
Person auf demselben Konto einen passenden Einkommensplan verwenden oder ihr
Monatsnetto ausdrücklich eintragen. Ein Planbetrag ohne Buchung ist eine Schätzung.
Fehlendes Einkommen bleibt unbekannt. Bei gemeinsamen Verpflichtungen benötigen
die persönlichen Anteile beide Nettoeinkommen. Die Beträge lassen sich direkt in
den persönlichen Budgetkarten ändern und gelten nur für diesen Monat.

Die Kontostandsprognose darunter verwendet weiterhin echte Bankeingänge,
Fälligkeiten und Einmalposten. Flexible Schätzungen und Budgets stehen separat
in der Monatsübersicht. Ein eingetragenes
Monatsnetto erzeugt keinen zusätzlichen Bankeingang. Das Monatsbudget ist keine
Aussage über das heute auf dem Konto verfügbare Guthaben.

## Vertragsverwaltung (ab 0.6.0)

Unter **Verträge** können vorhandene Fixkosten oder erkannte Zahlungen als
Vorlage übernommen werden. Beim Speichern Anbieter, Suchtext, Betrag pro
Zahlung und Termine prüfen. Ein neuer Vertrag kann auch manuell angelegt werden.

Ein verknüpfter Fixkostenposten bleibt gespeichert, wird aber in der Prognose
und in den aktuellen Fixkostensummen/Anteilen durch den Vertrag ersetzt. So
werden keine doppelten Kosten eingeplant. Mehrere gleichzeitig laufende Verträge
dürfen nicht denselben Posten ersetzen. Erkannte automatische Vertragsmuster
werden ebenfalls zugunsten des verwalteten Vertrags zurückgestellt.

### Preise und Buchungszuordnung

Abbuchungen werden über Suchtext und Kategorie zugeordnet. Bei mehreren passenden
Verträgen dient der nächste gespeicherte Betrag zur Unterscheidung; Gleichstände
bleiben ungeklärt. Bei mehreren Policen desselben Anbieters am besten eine genaue
Mandatsreferenz als Suchtext verwenden. Als einmalig markierte Buchungen werden
für den Preisverlauf nicht verwendet. Eine abweichende Abbuchung ist ein Hinweis,
kein Beweis für eine vertragliche Preiserhöhung.

Die Standardeinstellung verwendet den letzten passenden Zahlbetrag für die
Prognose. Alternativ bleibt ein eigener Planbetrag maßgeblich. Der gespeicherte
Betrag wird erst mit „Letzten Betrag als Planbetrag übernehmen“ geändert. Der
Preisverlauf aus den Buchungen bleibt sichtbar.

### Laufzeiten und Fristen

Vertragsbeginn, Laufzeitende und Kündigungsfrist laut eigenen Unterlagen
eintragen. Die Frist kann in Kalendertagen oder Kalendermonaten berechnet oder
als exaktes Datum hinterlegt werden. Das genaue Datum hat Vorrang. Es werden
keine gesetzlichen Kündigungsfristen angenommen. Bei besonderen Vertragsregeln
das bestätigte exakte Datum verwenden. Ohne ausreichende Angaben bleibt die
Frist unbekannt.

Eine Verlängerung wird nur angenommen, wenn eine Monatszahl größer null
eingetragen ist. Nach Ablauf wird das Ende anhand dieser Angabe weitergerechnet.
Ein exaktes Datum aus einer alten Laufzeit wird dabei nicht als neue Frist
weiterverwendet. Anstehende Fristen bis 30 Tage sowie verstrichene Fristen sind
im Vertragsbereich sichtbar; die Übersicht weist zusätzlich auf sie hin.

„Gekündigt bis Enddatum“ benötigt ein bestätigtes Enddatum. Bis dahin werden
fällige Zahlungen weiter geplant; danach stoppt die Prognose. „Beendet /
archiviert“ stoppt die Planung unmittelbar, ohne Vertragsdaten und Buchungen
zu löschen. Die Beträge pro Jahr sind normalisierte Hochrechnungen, keine
Restlaufzeitabrechnung.

### Kalender

„Frist als Kalendertermin“ lädt eine ICS-Datei herunter. Sie kann in einen eigenen
Kalender importiert werden und enthält eine Erinnerung sieben Tage vor der Frist.
Die Unterstützung der Erinnerung hängt vom Kalenderprogramm ab. Die Datei wird
nicht automatisch mit späteren Vertragsänderungen synchronisiert. Die Anwendung
versendet keine Kündigungen, E-Mails oder Push-Nachrichten.

### Update

Dieselbe Repository-App auf 0.6.0 aktualisieren und geöffnete Seiten neu laden.
Bestehende Daten, Bankverbindung und Rückleitungs-Integration bleiben erhalten.
Verträge werden in der gemeinsamen JSON-Sicherung mitgesichert.

## PayPal und direkte Vertragszuordnung (ab 0.6.1)

Unter **Buchungen → Zweck ansehen** wird der vollständige übermittelte
Verwendungszweck angezeigt. Bei üblichen PayPal-Referenzpräfixen zeigt die Tabelle
den danach stehenden Händlertext zuerst. Die Rohdaten werden dafür nicht
verändert. Fehlt der Händlername in den von der Bank gelieferten Daten, lässt
er sich aus einer PayPal-Zahlungsnummer nicht zuverlässig rekonstruieren.

Über **Vertrag zuordnen** kann eine einzelne Abbuchung direkt einem vorhandenen
Vertrag zugeordnet oder als Vorlage für einen neuen Vertrag verwendet werden.
Die Verknüpfung hat für die Buchungszuordnung Vorrang vor Kategorie und Suchtext.
Andere PayPal-Zahlungen werden dadurch nicht automatisch verknüpft.

Bei einem stabilen Händlertext kann der Vertrag weiterhin automatisch über einen
präzisen Suchtext zugeordnet werden. Allgemeine Suchtexte wie „PayPal“ reichen
dafür nicht aus. Im Modus **Nur einzeln zugeordnete Buchungen** werden nur explizit
verknüpfte Zahlungen verwendet. Bei reinen PayPal-Zahlungsreferenzen ist dieser
Modus in neuen Vertragsvorlagen voreingestellt.

Eine direkte Gesamtzuordnung ist für einzelne Abbuchungen vorgesehen. Bei
aufgeteilten Buchungen oder verknüpften Umbuchungen ist sie nicht verfügbar. Vor
einer nachträglichen Aufteilung einer verknüpften Abbuchung zuerst den Vertragslink
lösen. Die Kategorie kann unabhängig bearbeitet werden. Import und Dublettenabgleich
behalten den Link und den unveränderten Originalzweck bei.
