# 0.14.0

- Manueller KI-Probelauf unter Essensplan → Neue Ideen · KI: eine Prospektseite als Bild oder Angebotstext, Anbieter und Gültigkeitszeitraum wählen; bis zu fünf schnelle Chefkoch-Rezepte suchen.
- Wahlweise vegetarisch, belegte Rezeptquellen und maximal 30 Minuten; Vorschläge ohne passende Quellen-URL ausblenden. Erkannte Angebote und Hinweise zum Prüfen anzeigen.
- Übernahme in den vorhandenen Mealie-Import mit vorausgefülltem Link; Rezeptfoto, Einplanung und Bring-Zutaten danach über die bestehende Sammlung.
- Nur ausdrücklicher Start löst eine kostenpflichtige OpenAI-Anfrage aus. Ergebnisse zentral speichern und kostenlos neu laden; keine automatische Prospektabfrage und kein Wochenautomatismus.
- Benannten OpenAI-Schlüssel aus der schreibgeschützt eingebundenen Home-Assistant-secrets.yaml lesen; nie an Browser oder Logs geben. KI standardmäßig aus.
- Persistente Reservierung je Versuch, Monatskontingent, begrenzte Suchaufrufe/Ausgabe, Schutz vor Doppelstart und Wiederholung unklarer Anfragen. Verbrauchszähler für erfolgreiche Läufe anzeigen.
- Standardmodell gpt-6-luna; gpt-4.1-mini als konfigurierbare Alternative. Tatsächliche Modellverfügbarkeit und Rezeptqualität werden erst beim eigenen Probelauf geprüft.

# 0.13.0

- Mehrere Personen über ihre Bilder gleichzeitig als Verantwortliche für Aufgaben und Routinen auswählen; Familie weist den Eintrag allen zu.
- Auch die Aufgaben-/Routinenansicht nach mehreren ausgewählten Personen filtern. Familie zeigt wieder alles.
- Zugewiesene Bilder und Namen gemeinsam anzeigen. Ein Eintrag bleibt eine gemeinsame Aufgabe mit gemeinsamem Fortschritt, ohne Duplikate je Person.
- Vorhandene Einzel-/Familienzuweisungen weiter unterstützen. Mehrfachzuweisungen beim Bearbeiten erhalten, auch wenn ein älterer geöffneter Client die neue Personenliste noch nicht kennt.
- Jörns Termine erhalten „In Google Kalender bearbeiten“: öffnet Google Kalender am Tag des Termins zum Auswählen und Bearbeiten. Direktes Ändern in der Familienküche wird von der aktuellen Google-Anbindung in Home Assistant nicht unterstützt.

# 0.12.2

- Falsche Wettersymbole behoben: bisher wurden außer Sonne und klarer Nacht alle Zustände als einfache Wolke dargestellt.
- Passende eigene SVG-Zeichnungen für alle 15 Home-Assistant-Wetterzustände einschließlich Regen, Starkregen, Nebel, Schnee, Schneeregen, Hagel, Gewitter, leichter Bewölkung und Wind.
- Text und Symbol aus einer gemeinsamen Zustandszuordnung in Kopfbereich, Wetterdialog, Tagesvorhersage und Ruhemodus erzeugen.
- Unbekannte oder fehlende Wetterzustände neutral mit Fragezeichen und entsprechendem Hinweis anzeigen.

# 0.12.1

- Dieselben Personenfotos, Farbringe und Familie-Schaltflächen wie im Kalender für Aufgaben und Routinen verwenden.
- Zugewiesene Personen auch auf Aufgabeneinträgen, Routinenkarten und in der Routine anzeigen.
- Beim Anlegen und Bearbeiten die Person direkt über ihr Bild auswählen; Personen-Dropdown ersetzen.
- Aufgaben- und Routinesymbol über zwölf beschriftete grafische Kacheln auswählen; Symbol-Dropdown ersetzen.
- Auch die Symbole einzelner Routinen-Schritte über eine aufklappbare grafische Auswahl ändern.
- Profilaktualisierungen in offenen Entwürfen übernehmen, ohne Titel, Zuweisung, Symbol oder andere Eingaben zu ersetzen. Bestehende Fortschritte unveränderter Schritte bleiben erhalten.

# 0.12.0

- Personenleiste mit runden Fotos für Tina, Jörn und Felix sowie eigener Familie-Schaltfläche.
- Ein Tipp auf eine Person zeigt ausschließlich deren zugeordnete Termine; Familie stellt alle Termine einschließlich Müll, Geburtstagen und Feiertagen wieder her. Auswahl gilt für Woche, Monat, Liste, Tagesdetails und die nächste Kalenderanzeige.
- Optionen → Personen & Farben: private Personenfotos hochladen/ersetzen/entfernen; ohne Foto erscheinen Initialen.
- Frei wählbare Personenfarben mit Farbauswahl und Palette; Farben auf Fotoringe, Kalendertermine und vorhandene Personenkennzeichnungen anwenden.
- Profile zentral auf dem NUC speichern und auf weiteren Geräten übernehmen. Revisionsprüfung verhindert versehentliches Überschreiben gleichzeitiger Änderungen.
- Fotos separat vom Ruhemodus-Album als normalisierte 320×320-JPEGs ohne Kamerametadaten speichern und ausschließlich über HA-Ingress ausliefern.
- Bewährte Einzeldatei-Auswahl und Bildaufbereitung für Android wiederverwenden; native Dateifelder beim Nachladen erhalten.

# 0.11.2

- Flackern der Hintergrundfotos im Ruhemodus behoben: Bild und Ansicht bei Uhr-, Wetter-, Kalender- und Fotoalbum-Aktualisierungen nicht mehr vollständig entfernen und neu einsetzen.
- Auch die Vollbildfläche über Home Assistant gezielt aktualisieren und das sichtbare Bild im Dokument behalten.
- Nächstes Foto vorladen und erst nach erfolgreichem Laden einsetzen; während langsamer oder fehlgeschlagener Anfragen das bisherige Foto weiter anzeigen.
- Verspätete Rückmeldungen überholter Foto-Wechsel ignorieren. Vollbild, Wetterdialog und Aufwachen bleiben erhalten.

# 0.11.1

- Ruhemodus ohne Außenabstände und abgerundeten Rahmen über die gesamte verfügbare Bildschirmfläche anzeigen.
- Bei Home-Assistant-Ingress mit gleichem Ursprung eine isolierte Vollbildfläche über HA-Kopfzeile und Seitenleiste legen; die App läuft im ursprünglichen eingebetteten Bereich weiter.
- Fotos, Uhr, Wetter und Küchentimer-Hinweise weiter aktualisieren; Wetter öffnet die normale Detailansicht.
- Tippen oder Escape beendet den Ruhemodus und stellt den Kalender wieder her. Vollbildfläche bei HA-Navigation, Neuladen oder Entfernen der Einbettung automatisch entfernen.
- Automatischer Start nach Inaktivität benötigt keine Browser-Vollbildberechtigung. Android-Systemleisten werden weiterhin über den Vollbildmodus der Home-Assistant-App gesteuert.

# 0.11.0

- Zentrale Erinnerungs-Vorschau für die nächsten 14 Tage: Müllabfuhr am Vorabend um 18 Uhr und zeitgebundene Termine von Tina/Jörn mit 30 Minuten Vorlauf.
- Einstellbare Regeln, Personen und Ruhezeiten; Berechnung in Europe/Berlin mit Zeitumstellungsbehandlung.
- Glocke und kompakte fällige Hinweise im Kalender; Schließen und um 10/30 Minuten verschieben, ohne Kalendertermine zu ändern.
- Vorschau als Standard: automatische Handy-Nachrichten bleiben ausgeschaltet.
- Mobile Home-Assistant-Benachrichtigungsziele automatisch entdecken, Testversand mit vorheriger Übersicht und anschließend manueller Empfangsbestätigung.
- Automatische Push-Erinnerungen erst nach bestätigtem Test und ausdrücklicher Aktivierung; kein nachträglicher Versand bereits vorher fälliger Hinweise.
- Konfiguration, geschlossene/verschobene Hinweise und Versandversuche zentral speichern; unbestätigte Sendungen nicht automatisch wiederholen.
- Nicht erreichbare Kalender und abgesagte/geänderte Termine berücksichtigen; abgelaufene Erinnerungen nicht nachsenden.

# 0.10.2

- Fotoauswahl im nativen Einzeldatei-Modus: umgeht die fehlerhafte Mehrfachauswahl-Rückgabe bestimmter Home-Assistant-Android-App-Versionen, die auch bei einem einzelnen Foto auftreten kann.
- Einheitlicher Bildfilter für den Smartphone-Picker; Fotos können nacheinander zum gemeinsamen Album hinzugefügt werden.
- Dateifeld nach der Auswahl nicht mehr automatisch leeren; ausgewählter Dateiname bleibt beim Lesen und nach dem Upload sichtbar.
- Gewählten Dateinamen zusätzlich im Albumdialog anzeigen und eine leere oder abgebrochene Dateirückgabe sichtbar melden.
- Foto-Dialog am sichtbaren Smartphone-Bildschirm ausrichten, damit Meldungen trotz breiter Tablet-Oberfläche vollständig erreichbar bleiben.
- Browserprüfung um Smartphone-Ansicht mit nativer Einzeldateiauswahl, erhaltenem Dateinamen und sichtbaren Dialoggrenzen erweitert.

# 0.10.1

- Dateiauswahl bleibt beim Nachladen des Fotoalbums bestehen; eine bereits geöffnete native Auswahl verliert ihr Zielfeld nicht mehr.
- Natives sichtbares Dateifeld und direkte Verarbeitung des Auswahlereignisses für ältere Browser.
- JPEG-/PNG-/WebP-Dateien mit fehlendem oder allgemeinem Dateityp anhand ihrer Endung zulassen; gebräuchliche JPEG-MIME-Aliase berücksichtigen.
- Sichtbare Fortschrittsmeldungen je Foto; Uploadfehler und Erfolgsbestätigung bleiben nach Album-Aktualisierung erhalten.
- Abgebrochene, blockierte und nicht lesbare Fotodateien melden, statt den Upload dauerhaft zu blockieren; verzögerte Rückmeldungen nach Zeitüberschreitung ignorieren.
- Nach erfolgreichem Upload das Album auch dann erneut laden, wenn vorher noch eine Leseanfrage offen war.

# 0.10.0

- Eigener Aufgaben-Reiter mit Personenfiltern, Einzelaufgaben und wiederkehrenden Aufgaben nach Wochentag.
- Gemeinsam gespeicherte Routinen mit bis zu zwölf großen Bildschritten; bearbeitbare Vorlagen „Guten Morgen“ und „Gute Nacht“ für Felix.
- Häkchen je Wiederholungstag, Tagesvorschau, Verlauf und Verwaltung aller Aufgaben; Konfliktprüfung bei Änderungen von mehreren Geräten.
- Aufgaben, Routinen und Fortschritt bleiben zentral im App-Datenverzeichnis auf dem NUC erhalten.
- Familien-Bildschirmschoner mit bis zu 20 privaten Fotos, Wechselintervall, Füllen-/Ganzbildansicht, Uhr, Wetter und nächstem Termin.
- Foto-Upload mit Verkleinerung, normalisierter JPEG-Ausgabe ohne Kamerametadaten; Entfernen erst nach Bestätigung.
- Gerätespezifische dunkle Ansicht und zeitgesteuertes nächtliches Abdunkeln der Oberfläche.

# 0.9.0

- Gemeinsame Wochen-Zutatenvorschau für alle geplanten Abendessen mit Rezept, Portionszahl, Herkunft und Vorratsauswahl.
- Kompatible Mengen gleicher Lebensmittel bündeln; g/kg und ml/l umrechnen, unterschiedliche Einheitenarten und Zubereitungsangaben getrennt halten.
- Geprüfte Wochenübernahme in die konfigurierte Einkaufsliste mit bestehender Konflikt- und Wiederholungssicherung.
- Große Kochansicht mit Zutatenhaken, einzelnen Schritten und lokal gespeichertem Fortschritt.
- Bis zu sechs Küchentimer mit Pause, Fortsetzen, Zurücksetzen, Ablaufanzeige und Signalton.
- Timer über feste Endzeiten nach Browserpausen wiederherstellen; dauerhaft erreichbare Timeranzeige.

# 0.8.1

- Wochentags-Schaltflächen von den Rezeptkarten entfernt.
- Kompakter Einplanen-Button öffnet die Tagesauswahl als Pop-up.
- Vergangene und belegte Tage bleiben geschützt; Öffnen des Pop-ups schreibt noch keinen Plan.
- Pop-up schließt erst nach bestätigtem Speichern; Fehler bleiben darin sichtbar.

# 0.8.0

- Gemeinsame Mealie-Familienfavoriten anhand des Tags Familienfavorit bevorzugen und kennzeichnen.
- Kombinierbare Vorschlagsfilter: Favoriten, vegetarisch und unter 30 Minuten; unbekannte Merkmale transparent anzeigen.
- Kochdaten, letzte 28 Tage Essensplan und bereits geplante Gerichte für mehr Abwechslung berücksichtigen.
- Vorschläge mit einem Tipp einem freien Wochentag als Abendessen zuordnen; belegte und vergangene Tage schützen.
- Suche in bis zu 100 Rezepten, bis zu zwölf gewichtete Vorschläge und Andere-Ideen-Funktion.
- Neue Chefkoch-Imports mit Tag-Übernahme durch Mealie.

# 0.7.1

- Listenansicht zeigt laufende und kommende Termine der ausgewählten Woche; vergangene Geburtstage und abgeschlossene Termine entfallen.
- Heutige Ganztagstermine bleiben bis Mitternacht sichtbar, laufende Termine bis zur Endzeit.
- Wochen-/Monatsraster und Tagesdetails behalten vergangene Termine und Geburtstage vollständig.
- Zeitfilter wird beim Minuten- und Tageswechsel ohne manuelles Neuladen aktualisiert.

# 0.7.0

- Überlappende Termine als breite gemeinsame Karte mit lesbaren Titeln und Start-/Endzeiten; vollständige Liste durch Antippen.
- Einzeltermine oben ausgerichtet, mehrzeilige Titel nur bei ausreichendem Platz.
- Rezeptzutaten mit Portionszahl, Auswahl und bearbeitbaren Mengen in die konfigurierte Einkaufsliste übernehmen.
- Bereits vorhandene identische Einträge erkennen; unklare Mengen zur Prüfung kennzeichnen.
- Fortschritt bei Teilübertragungen speichern und automatische Wiederholungen verhindern.

# 0.6.0

- Gemeinsame Einkaufsliste über die konfigurierbare Home-Assistant-To-do-Entität, Standard todo.einkaufsliste.
- Hinzufügen, Abhaken, Wiederherstellen, Umbenennen und bestätigtes Entfernen direkt synchronisieren.
- Erledigte Einträge einklappbar und Anzahl offener Artikel in der Navigation.
- Aktualisierung spätestens alle 30 Sekunden im Einkaufsreiter; Entwurf und Scrollposition bleiben erhalten.
- Unterstützung von Listenfähigkeiten, Konflikterkennung und Schutz vor doppelten Schreibanfragen.
- Verbindungsfehler zeigen den letzten geladenen Stand; keine unbestätigten lokalen Änderungen.

# 0.5.1

- Rezeptnamen in der Kalender-Essenszeile auf zwei Zeilen begrenzt.
- Die Essenszeile bleibt auch bei langen Namen gleich hoch; vollständiger Name im Essensplan und Tooltip erreichbar.

# 0.5.0

- Wochenraster auf 07:00–22:00 Uhr begrenzt; Uhrzeitlinie außerhalb dieses Bereichs ausgeblendet.
- Tageshinweis für Termine außerhalb des sichtbaren Zeitbereichs.
- Geburtstage und Feiertage als eigene lesbare Quellen ergänzt, unabhängig von Personenfiltern.
- Echtes Wetter im Kopf und Ruhemodus, antippbare Detailansicht mit Tagesvorhersage.
- Konfigurierbare Wetterquelle, Standard weather.home; Ladefehler und veraltete Daten werden angezeigt.

# 0.4.0

- Installation und Folgeupdates über dieses Home-Assistant-App-Repository.
- Kalenderquellen und Mealie-Zuordnung über die App-Optionen konfigurierbar.
- Wochenraster für den vollständigen Tag von 00:00 bis 24:00 Uhr.
- Mitwandernde Uhrzeitlinie in der heutigen Spalte, Aktualisierung alle 15 Sekunden.
- Scrollposition bleibt bei Datenaktualisierungen erhalten.
- Enthält Mealie-Anbindung und die kompakte Anzeige kurzer Termine aus 0.3.x.
