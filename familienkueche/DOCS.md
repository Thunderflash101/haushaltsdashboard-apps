# Familienküche

Eigenständige Oberfläche für ein Tablet im Querformat mit Wochen-, Monats- und Listenansicht, Kalenderdaten aus Home Assistant und Essensplanung aus der bestehenden Mealie-Integration.

## Installation und Updates

Dieses GitHub-Repository in Home Assistant unter Einstellungen → Apps → App-Store → ⋮ → Repositories hinzufügen. Anschließend Familienküche installieren und die Quellen in der App-Konfiguration zuordnen. Neue Versionen werden über den App-Store angeboten. Ein Neustart allein installiert keine geänderte Version; das angebotene Update ausführen. Automatische Updates können nach einem erfolgreichen Test in der App-Verwaltung aktiviert werden.

Kalenderoptionen: `tina_calendar`, `joern_calendar`, `waste_calendar` erwarten die jeweiligen vollständigen `calendar.*`-Entitäten. Die generischen Standardwerte sind Platzhalter. Felix hat vorerst keinen eigenen Kalender.

Mealie-Optionen: `mealie_entry_id` ist die Konfigurationseintrags-ID der bereits eingerichteten Mealie-Integration (kein Token). `mealie_image_base_url` ist die lokale Basisadresse von Mealie; vorbelegt ist die Standardadresse der Community-App. Zugangsschlüssel bleiben serverseitig in Home Assistant. Die App wird ausschließlich über den angemeldeten Ingress-Zugang geöffnet.

## Einmaliger Wechsel von einer lokalen App

Die Repository-App und die lokale App besitzen unterschiedliche App-Kennungen. Die Repository-App einmal neu installieren und die Optionen aus der bisherigen App übernehmen. Die lokale App zunächst behalten und stoppen. Erst nach Prüfung der Kalender und Mealie-Daten zur Repository-App wechseln. In Home Assistant und Mealie gespeicherte Termine, Rezepte und Pläne bleiben erhalten. Tablet-Einstellungen wie der Ruhemodus müssen wegen des neuen Ingress-Pfads eventuell erneut gesetzt werden. Interne Anfragekennungen der alten App werden nicht übertragen; vor dem Wechsel den Abschluss laufender Speichervorgänge prüfen.

## Kalender

Der Wochenkalender zeigt 07:00–22:00 Uhr mit Stunden- und Halbstundenlinien. Beim Öffnen steht er in der Nähe der aktuellen Uhrzeit, andere Wochen beginnen bei 08:00; der sichtbare Zeitbereich ist scrollbar. Vollständig außerhalb liegende Termine sind über einen Tageshinweis erreichbar; die Listen- und Detailansicht enthalten weiterhin alle Termine. In der heutigen Spalte markiert eine Linie zwischen 07:00 und 22:00 Uhr die aktuelle Zeit und aktualisiert sich alle 15 Sekunden. Außerhalb des Bereichs wird sie ausgeblendet. Bei Datenaktualisierungen bleibt die Scrollposition erhalten. Die Zeitzone des Tablets sollte Berlin sein.

Bei kurzen Blöcken entfallen Textzeilen, für die kein Platz ist. Die Details sind durch Antippen erreichbar. Tina und Müll werden lesend dargestellt; neue Termine können in Jörns zugeordnetem Kalender angelegt werden, wenn dieser das unterstützt. Änderungen und Löschungen erfolgen derzeit in der Kalenderquelle.

## Mealie

Abendessen für die Woche, Rezeptsuche mit bis zu 40 Treffern, Rezeptbilder, Zutaten und Zubereitung. HTTPS-Rezeptlinks von Chefkoch können nach Absenden des Importformulars über Mealie importiert werden. Es gibt keinen automatischen Chefkoch-Tagesfeed. Fehlende Fotos zeigen einen Platzhalter. Die gemeinsame Einkaufsliste ist ab Version 0.6.0 angebunden.

Gerichte lassen sich hinzufügen, gezielt tauschen und aus dem Plan entfernen. Bei erkannten Änderungen des Tagesplans muss zuerst aktualisiert werden. Bei einer unklaren Schreibbestätigung nicht sofort wiederholen, sondern erst den Stand in Mealie/Google Kalender prüfen.

## Prüfungen

Python: `python3 -m unittest discover -s tests -v` nach Installation von `requirements.txt`. DOM-Funktionsprüfungen benötigen Node und jsdom: `NODE_PATH=<node_modules> node tests/frontend.cjs` sowie `node tests/meals-frontend.cjs`.

Der Build und Betrieb unter Supervisor sowie echte Mealie-Imports und Bildabrufe müssen auf der eigenen Installation geprüft werden.

## Geburtstage und Feiertage (ab 0.5.0)

Zusätzlich werden `calendar.geburtstage_2` und `calendar.feiertage_in_deutschland` eingebunden. Die Optionen `birthdays_calendar` und `holidays_calendar` sind damit vorbelegt und können geändert werden. Beide Quellen sind ausschließlich lesbar. Sie bleiben wie Mülltermine auch bei ausgeschalteten Personenfiltern sichtbar; Geburtstage sind rosa und Feiertage gelb markiert. Die Beschriftungen stehen in der Ganztagszeile, Monatsübersicht und Tages-/Terminliste zur Verfügung.

## Wetter (ab 0.5.0)

`weather_entity` ist mit `weather.home` vorbelegt. Der Server liest aktuelle Temperatur, Zustand und – sofern vorhanden – Wind und Luftfeuchte. Die Tagesvorhersage wird über `weather.get_forecasts` gelesen. Fehlende Werte bleiben als fehlend erkennbar. Die Anzeige übernimmt die Temperatureinheit aus Home Assistant.

Die Wetteranzeige im Kopf und Ruhemodus öffnet eine Detailansicht mit bis zu fünf Tagesvorhersagen und Aktualisieren-Schaltfläche. Der Server hält Daten höchstens fünf Minuten vor; auch manuelles Aktualisieren verwendet Daten innerhalb dieser Frist. Bei einem Lesefehler bleiben zuletzt geladene Werte als veraltet gekennzeichnet. Fällt nur die Vorhersage aus, bleiben aktuelle Werte verfügbar. Die Anzeige unterstützt andere Home-Assistant-Wetterquellen über dieselbe App-Option; Tagesvorhersagen benötigen die entsprechende Fähigkeit der Quelle.

Lesende Prüfungen der vorhandenen Wetterquelle und Tagesvorhersage waren erfolgreich. Nach dem Update auf dem Tablet kontrollieren: Ansicht 07:00–22:00 Uhr, Uhrzeitlinie während dieses Bereichs, neue Kalender und Wetterdetails. Das Update wurde nicht automatisch auf dem NUC installiert.

## Lange Rezeptnamen

Die Kalender-Essenszeile bleibt ab 0.5.1 auf 60 Pixel Höhe begrenzt und zeigt höchstens zwei Textzeilen pro Tag. Antippen öffnet den Essensplan mit dem vollständigen Titel. Um den Namen dauerhaft zu ändern, das Rezept in Mealie öffnen, bearbeiten und das Feld Name kürzen; anschließend speichern. Das Dashboard lädt die Änderung mit der nächsten Aktualisierung.

## Gemeinsame Einkaufsliste (ab 0.6.0)

Die Option `shopping_entity` ist mit `todo.einkaufsliste` vorbelegt. Für eine andere vorhandene Liste deren vollständige `todo.*`-Entität in den App-Optionen eintragen und die App neu starten. Es wird genau eine Liste verwendet; andere Listen und Mealie-Einkaufslisten werden nicht zusammengeführt.

Der Reiter Einkauf liest offene und erledigte Einträge direkt aus Home Assistant. Artikel können ergänzt, abgehakt, wieder geöffnet, umbenannt und nach einer Einzelbestätigung entfernt werden. Die Anzahl offener Einträge erscheint an der Navigation. Die verfügbaren Schaltflächen richten sich nach den Fähigkeiten der gewählten Liste. Mengen stehen im Artikelnamen; ab 0.7.0 ist eine Portions- und Zutatenübernahme aus Rezepten möglich.

Die Liste wird beim Öffnen, über Aktualisieren und im geöffneten Reiter spätestens alle 30 Sekunden nachgeladen. Außerhalb des Reiters wird der Zähler mit der allgemeinen Aktualisierung erneuert. Es gibt keinen Push-Kanal; Änderungen anderer Geräte erscheinen nach dem nächsten Abruf. Textentwürfe und die Scrollposition bleiben beim Nachladen erhalten.

Schreibvorgänge beziehen sich auf die eindeutige Eintrags-ID. Vorher wird geprüft, ob der Eintrag seit dem Laden geändert wurde; bei einem erkannten Konflikt zuerst aktualisieren. Die Prüfung ist keine atomare Sperre anderer HA-Clients. Gleiche offene Artikelnamen werden beim Hinzufügen als bereits vorhanden gemeldet. Erfolgreiche und ungewisse Anfragekennungen werden wie bei Kalender und Mealie gespeichert, sodass derselbe Vorgang nicht versehentlich wiederholt wird. Die UI bestätigt Änderungen erst nach der Dienstantwort. Bei Verbindungsproblemen bleiben letzte Daten sichtbar und als veraltet markiert; es gibt keine Offline-Schreibwarteschlange.

Echte Lesetests mit der vorhandenen Liste waren erfolgreich. Automatisierte Backend- und DOM-Prüfungen decken Hinzufügen, Statuswechsel, Wiederherstellen, Umbenennen, Entfernen, Konflikte, Doppelklicks und Verbindungsfehler ab. Es wurden keine Testartikel in die echte Liste geschrieben. Nach dem App-Update die Synchronisierung auf dem Tablet und in Home Assistant mit einem selbst gewählten Artikel prüfen.

Zusätzliche DOM-Prüfung: `NODE_PATH=<node_modules> node tests/shopping-frontend.cjs`.

## Lesbare Zeitüberschneidungen (ab 0.7.0)

Überlappende Termine teilen sich eine breite gemeinsame Karte über die volle Tagesspalte. Ihre Zeitspanne reicht vom Beginn des ersten bis zum Ende des letzten beteiligten Termins. Die einzelnen Start- und Endzeiten stehen als Text darin; ihre Zeilen sind keine maßstabsgetreuen Einzelbalken. Wenn ausreichend Platz vorhanden ist, erscheinen die Titel und Zeiten untereinander. Bei sehr kurzen Gruppen erscheint ein kompakter Hinweis. Antippen öffnet alle Termine mit vollständigen Titeln und Zeiten. Anschließende Termine ohne Überschneidung bleiben getrennt. Einzeltermine beginnen oben im Block; nur bei ausreichender Höhe werden Titel mehrzeilig dargestellt.

## Rezeptzutaten einkaufen (ab 0.7.0)

Im Essensplan oder im geöffneten Rezept **Zutaten einkaufen** wählen. Die Vorschau zeigt die tatsächlich konfigurierte Zielliste und startet mit drei Portionen. Soll es die Bring-Liste sein, muss `shopping_entity` weiterhin auf deren `todo.*`-Entität gesetzt sein. Ein Update überschreibt vorhandene App-Optionen nicht.

Portionszahl ändern und Mengen anpassen. Erfasste numerische Zutatenmengen mit eindeutigem Lebensmittel werden anhand der Original-Portionszahl umgerechnet. Einheiten werden nicht ineinander umgerechnet. Freitext, fehlende Original-Portionszahlen und unklare Mengen bleiben unverändert und sind zur Prüfung markiert. Die Mengen sind gerundet auf bis zu drei Nachkommastellen; sehr kleine Werte werden nicht auf null gerundet. Jede Zutat kann vor der Übernahme bearbeitet und abgewählt werden. Änderungen am Text werden beim erneuten Anpassen der Portionszahl zurückgesetzt.

Bereits identisch vorhandene offene Artikel sind standardmäßig abgewählt. Nur identische Texte nach Bereinigung von Groß-/Kleinschreibung und Leerzeichen werden erkannt: „Milch“ und „200 ml Milch“ bleiben verschiedene Artikel. Auch während der Übernahme werden identische offene Einträge übersprungen. Mengen werden nicht automatisch addiert. Erst **Auswahl übernehmen** schreibt die ausgewählten, gegebenenfalls bearbeiteten Texte auf die konfigurierte Liste.

Das Rezept wird vor dem Schreiben erneut geprüft. Bei einer inzwischen geänderten Zutatenliste muss die Vorschau neu geöffnet werden. Ein Vorgang umfasst höchstens 80 Zutaten mit je 200 Zeichen. Home Assistants To-do-Schnittstelle unterstützt keine atomare Mehrfachanlage: Nach jedem bestätigten Artikel wird der Fortschritt gespeichert. Ein Abbruch nennt die bestätigten und übersprungenen Artikel, sperrt eine automatische Wiederholung und lässt übrige Zutaten ungesendet. In diesem Fall erst die Liste prüfen. Es wird nichts automatisch rückgängig gemacht. Das Übernahmeprotokoll enthält Zähler und Zielbezeichnung, keine vollständige Rezeptkopie.

Backend- und DOM-Prüfungen decken Portionsberechnung, manuell bearbeitete Auswahl, bereits vorhandene Einträge, Rezeptänderungen, Teilfehler und Wiederholungen ab. Ein echtes Mealie-Rezept wurde lesend geprüft; die erfassten Zutaten sind für die Vorschau verfügbar. Es wurden keine Testzutaten in die echte Einkaufsliste geschrieben. Darstellung und echter Schreibvorgang sind nach dem Update auf dem Tablet zu prüfen.

Weitere DOM-Prüfungen: `node tests/calendar-overlap.cjs` und `node tests/ingredients-frontend.cjs` (mit verfügbarem jsdom).

## Vergangene Termine und Geburtstage (ab 0.7.1)

Die Listenansicht ist eine Vorschau auf laufende und kommende Termine **der ausgewählten Woche**. Bereits vergangene Tage erscheinen dort nicht mehr; heute endende Termine verschwinden nach ihrer Endzeit. Ganztägige Einträge wie Geburtstage bleiben am heutigen Tag bis Mitternacht sichtbar. Der Filter betrifft alle Kalenderquellen gleichermaßen und wird beim Minuten-/Tageswechsel aktualisiert.

Die Wochen- und Monatsansicht enthalten weiterhin alle Termine ihres ausgewählten Zeitraums, einschließlich vergangener Geburtstage und abgeschlossener Termine. Ebenso bleiben die Tagesdetails vollständig. Die Daten werden weder in Home Assistant gelöscht noch pauschal beim Laden nach dem aktuellen Datum gefiltert. In einer vollständig vergangenen Woche ist die Liste daher leer und verweist auf die historischen Ansichten.

Bei der Prüfung lieferte Home Assistant den beanstandeten Geburtstag korrekt als Ganztagstermin vom 3. November bis zum exklusiven Ende am 4. November. Ursache war die bisher ungekürzte Wochenliste, keine Verschiebung des Geburtstagsdatums. Die Regressionstests prüfen laufende, heutige, vergangene und zukünftige Einträge, den Ablauf exakt an der Endzeit und Mitternacht sowie den unveränderten Zugriff auf Woche, Monat und Tagesdetails.

## Familienfavoriten und Vorschläge (ab 0.8.0)

Im Essensplan erscheint „Ideen für eure Woche“. Gemeinsame Familienfavoriten werden über den Mealie-Tag **Familienfavorit** gekennzeichnet: Mealie → Rezept → Bearbeiten → Tags → Familienfavorit hinzufügen → Speichern. Auch die entsprechende Kategorie wird erkannt. Im Dashboard anschließend Aktualisieren tippen. Die vorhandene HA-Mealie-Integration bietet keine Schreibaktion für Tags oder persönliche Favoriten; der Dashboard-Hinweis öffnet die Anleitung, keinen vorgetäuschten Favoriten-Schalter. Persönliche Mealie-Herzmarkierungen werden über diese Schnittstelle nicht ausgewertet. Der gemeinsame Tag ist die verbindliche Kennzeichnung.

Die kombinierbaren Filter „Favoriten“, „Vegetarisch“ und „Unter 30 Min.“ verwenden explizite Tags/Kategorien und verlässliche Zeitangaben. „Vegetarisch“, „Vegetarian“, „Veggie“ und „Vegan“ sowie die dokumentierten deutschen Varianten werden erkannt; Rezeptnamen werden nicht zur Ernährungs-Klassifizierung geraten. Unmarkierte Rezepte bleiben im ungefilterten Vorschlagspool verfügbar. Für den Schnellfilter muss die bekannte Gesamtzeit **kleiner als 30 Minuten** sein. Unterstützt werden ISO-Zeiten sowie gängige deutsche/englische Minuten- und Stundenangaben. Fehlt die Gesamtzeit, kann nur ein vollständiges Paar aus Vorbereitungs- und Kochzeit als Summe dienen. Vorbereitungszeit allein genügt nicht. Unbekannte Zeiten sind sichtbar gekennzeichnet und werden aus dem Schnellfilter ausgeschlossen.

Favoriten werden höher gewichtet. Ein vorhandenes Mealie-Kochdatum und Essenspläne der letzten 28 Tage senken die Priorität kürzlich verwendeter Rezepte; innerhalb der letzten sieben Tage ist die Abwertung stärker als der Favoritenbonus. Bereits für die ausgewählte Woche geplante Gerichte werden ebenfalls nach hinten gestellt. Bei kleinen Sammlungen können kürzlich verwendete Rezepte weiterhin erscheinen. Ein vergangener Essensplaneintrag ist kein bestätigter Verzehr: Die Oberfläche unterscheidet „Zuletzt geplant“ und „Zuletzt gekocht“. Kochdaten müssen in Mealie gepflegt sein, wenn die tatsächliche Zubereitung berücksichtigt werden soll. Fehlt die Essensplanhistorie wegen eines Fehlers, meldet die Oberfläche die eingeschränkte Bewertung.

Pro Suche werden bis zu 100 Rezepte über Home Assistant geladen, davon bis zu zwölf passende Vorschläge angezeigt. Das ist die Grenze des verfügbaren HA-Dienstes, keine vollständige Durchsuchung beliebig großer Sammlungen. Bei größeren Sammlungen die Suche verwenden. „Andere Ideen“ mischt die Reihenfolge innerhalb der Gewichtungen neu; Tag und Kalenderwoche sorgen ebenfalls für Abwechslung. Bei neuen Chefkoch-Imports ist die Tag-Übernahme durch Mealie eingeschaltet; ob passende Merkmale vorhanden sind, hängt von der Quelle ab.

### Rezept einplanen

Ab 0.8.1 zeigt jede Rezeptkarte einen kompakten **Einplanen**-Button. Er öffnet ein Pop-up mit den sieben Tagen der angezeigten Woche. Das Öffnen des Pop-ups verändert den Plan nicht. Ein freier heutiger oder zukünftiger Tag lässt sich darin antippen; diese Auswahl speichert das Gericht als Abendessen in Mealie. Nach bestätigtem Speichern schließt sich das Pop-up. Vergangene und bereits belegte Tage sind deaktiviert. Vorhandene Gerichte über die bestehende Funktion „Tauschen“ bearbeiten. Vor dem Schreiben prüft der Server den geladenen Tagesstand erneut. Doppelklicks und unklare Bestätigungen lösen keine automatische Wiederholung aus; bei Unsicherheit zuerst aktualisieren und den Stand in Mealie prüfen.

Tests decken Metadaten, Zeitformate, die genaue 30-Minuten-Grenze, kombinierte Filter, Gewichtung, unvollständige Historie, Tageswahl und die Schreibschutzfälle ab. Rezeptmerkmale und ein vergangener Essensplan wurden erfolgreich aus der echten Mealie-Installation gelesen. Es wurden keine willkürlichen Rezepte als Favorit markiert und keine Testgerichte eingeplant. Chromium wurde lokal versucht, konnte in dieser Laufzeit jedoch nicht erfolgreich starten; Browserdarstellung und echtes Planen sind auf dem Tablet nach dem Update zu prüfen.

Zusätzliche Prüfung: `NODE_PATH=<node_modules> node tests/suggestions-frontend.cjs`.

Version 0.8.1 wurde mit DOM-Funktionsprüfungen für kompakte Karten, Pop-up-Auswahl, Öffnen ohne Schreibvorgang, Schutz belegter/vergangener Tage und Fehler-/Doppelklickverhalten geprüft. Tablet-Darstellung nach dem Update kontrollieren.

## Wocheneinkauf und Mengen bündeln (ab 0.9.0)

Im Essensplan **Wocheneinkauf** öffnen. Die Vorschau lädt alle mit Rezepten verknüpften Abendessen der ausgewählten Woche. Auch mehrere Gerichte pro Tag und dasselbe Rezept an mehreren Tagen werden jeweils berücksichtigt. Notizen wie „Auswärts“ bleiben sichtbar, liefern aber keine Zutaten. Derzeit gilt eine gemeinsame Portionszahl je Gericht; zunächst einstellen, anschließend Vorräte abwählen und die fertigen Einkaufstexte prüfen oder bearbeiten.

Die Vorschau fasst zuverlässig erfasste Mengen gleicher Lebensmittel mit gleicher Zubereitungsangabe zusammen. Verwendet werden die Mealie-Lebensmittel-ID beziehungsweise bei fehlender ID der gleiche Lebensmittelname und die Einheit. Beispiele: 200 g plus 300 g Tomaten ergeben 500 g; 750 g plus 0,5 kg ergeben 1,25 kg. Gramm/Kilogramm sowie Milliliter/Liter sind umrechenbar. Gewicht und Volumen werden nicht vermischt; EL und TL werden nicht in Milliliter umgerechnet. Andere Einheiten werden nur bei gleicher Bezeichnung zusammengefasst. Unterschiedliche Hinweise wie „ganz“ und „gewürfelt“ bleiben getrennt. Mengen ohne verlässliche Original-Portionszahl bleiben als Freitext erhalten.

Mehrfach vorkommender unstrukturierter Text wird ausdrücklich als „2 × …“ angezeigt und zur Prüfung markiert. Die Herkunft jeder Zeile lässt sich aufklappen. „Alles auswählen“ und „Alles abwählen“ erleichtern die Vorratsauswahl. Die Abwahl gilt für die aktuelle Vorschau und ist keine automatische Lagerverwaltung. Bei erneutem Anpassen der Portionszahl werden Auswahl und Textänderungen zurückgesetzt. Die Zielliste wird vor dem Übernehmen angezeigt; bestehende identische offene Einträge werden wie bisher übersprungen. Die berechnete Wochenmenge wird nicht mit bereits vorhandenen Artikeln der Bring-Liste addiert.

Vor dem Schreiben werden Wochenplan, Rezeptzutaten und Zielzuordnung erneut geprüft; erkannte Änderungen erfordern eine neue Vorschau. Die bestehende Fortschritts-/Wiederholungssicherung gilt auch für den Wochenvorgang. Quellenzugriffe sind auf 21 geplante Gerichte, 14 verschiedene Rezepte, 500 Quellzutaten und 100 zusammengefasste Einkaufszeilen begrenzt. Größere Wochen können über einzelne Rezepte übertragen werden.

## Große Kochansicht (ab 0.9.0)

Im geplanten Gericht oder in der Rezeptdetailansicht **Kochen** wählen. Zutaten stehen groß und abhakbar links, rechts wird ein Zubereitungsschritt mit Zurück/Weiter und „Schritt erledigt“ angezeigt. „Vollbild“ fordert die entsprechende Browserfunktion an, sofern die Home-Assistant-Einbettung sie erlaubt. Die Kochansicht nutzt andernfalls die verfügbare Fläche. Der Bildschirm-Ruhemodus der Familienküche pausiert während offener Dialoge und aktiver/unbestätigter Timer; die Geräteeinstellungen zum Ausschalten des Displays bleiben maßgeblich.

Zutatenhaken und Schrittfortschritt bleiben im Browser dieses Tablets gespeichert. Bei geänderten Rezeptzutaten oder Schritten wird der Fortschritt neu begonnen. Angezeigt werden die Original-Rezeptmengen und deren Portionsangabe; die Kochansicht verändert das Rezept nicht. Schrittmarkierungen sind kein Eintrag in Mealies Kochhistorie.

## Küchentimer (ab 0.9.0)

Bis zu sechs Timer mit Namen und 0,5 bis 1440 Minuten, außerdem Direktstarts für 5/10/15 Minuten. Timer können pausiert, fortgesetzt, zurückgesetzt und entfernt werden. Aktive Timer bleiben über eine kleine Anzeige auch nach Schließen der Kochansicht erreichbar. Bei Ablauf erscheinen eine sichtbare Meldung und – soweit vom Browser zugelassen und nach Start per Benutzeraktion – ein Signalton.

Timer speichern feste Endzeitpunkte im lokalen Browserspeicher. Nach einer Browserpause oder erneutem Öffnen wird die verbleibende Zeit daraus berechnet; abgelaufene Timer bleiben bis zur Bestätigung sichtbar. Die JavaScript-Seite muss für einen pünktlichen Signalton laufen. Bei geschlossenem Browser oder suspendiertem Tablet wird kein zuverlässiger Hintergrundalarm ausgelöst; ein überschrittener Timer wird beim Zurückkehren angezeigt. Die Lautstärke am Tablet prüfen. Browserdaten löschen entfernt Timer und Kochfortschritt. Es gibt keine geräteübergreifende Timersynchronisierung.

Die neuen Berechnungen und Abläufe wurden mit Backend- und DOM-Prüfungen getestet. Zusätzlich wurden Kochansicht und Wocheneinkauf mit Chromium/Playwright bei 1280×800 und 960×600 Pixeln geprüft, einschließlich Haken, Schrittwechsel, Timerstart, Vorratsauswahl und bearbeiteter Übergabe. Der Test verwendet Beispieldaten. Es wurden keine Testartikel in die echte Bring-Liste geschrieben; nach dem Update die Quellen, den Signalton und die Übernahme auf dem Fire-Tablet prüfen.

Zusätzliche Prüfungen: `node tests/timers.cjs`, `node tests/cooking-frontend.cjs`, `node tests/weekly-frontend.cjs` mit verfügbarem jsdom. Die Browserprüfung `node tests/browser-kitchen.js` benötigt Playwright und Chromium; optional `FAMILY_PLAYWRIGHT_MODULE` und `FAMILY_CHROMIUM` an die lokale Installation anpassen.


## Aufgaben und Routinen (0.10.0)

Im schmalen linken Menü öffnet **Aufgaben** einen eigenen Reiter, ohne den Kalender zu verkleinern. Oben zwischen **Aufgaben** und **Routinen** wechseln; Personenfilter für Alle, Tina, Jörn und Felix. „Alle“ zeigt alle Zuordnungen, „Alle“ als Aufgabenzuständigkeit bedeutet gemeinsam. Einzelne Personenfilter zeigen nur deren ausdrücklich zugeordnete Einträge.

- **+ Aufgabe:** Titel, Person, Symbol und Datum. Ohne Wochentage einmalig; offen gebliebene Einzelaufgaben bleiben ab ihrem Datum sichtbar, auch an Folgetagen. Einmal erledigt bleiben sie erledigt, bis jemand sie wieder öffnet.
- Mit gewählten Wochentagen wiederholt sich eine Aufgabe jede Woche an genau diesen Tagen ab dem Startdatum. Jeder vorgesehene Tag hat eigene Häkchen; verpasste Wiederholungen werden nicht als zusätzliche heutige Aufgaben gestapelt.
- **+ Routine:** mindestens einen Wochentag und 1–12 Schritte wählen. Schritte werden in der angegebenen Reihenfolge mit großen Symbolen dargestellt, können aber unabhängig abgehakt werden. Unter „Guten Morgen“ / „Gute Nacht“ im leeren Routinenbereich stehen bearbeitbare Vorlagen für Felix bereit; angelegt wird erst mit Speichern.
- Die Tagesnavigation zeigt vorherige und kommende Tage (bis zu ein Jahr Abstand). Zukünftige Tage sind nur Vorschau. Häkchen sind für heute und die letzten 31 Tage möglich. „Heute“ springt zurück.
- „Geschafft“ enthält erledigte Aufgaben bzw. Routinen. „Alle verwalten“ zeigt auch für den gewählten Tag nicht vorgesehene Einträge, damit zukünftige oder anders wiederkehrende Definitionen bearbeitbar bleiben. Entfernen löscht nach Bestätigung die gesamte Aufgabe/Routine samt zugehörigen Häkchen, nicht nur den ausgewählten Wiederholungstag.
- Unveränderte Routinen-Schritte behalten beim Bearbeiten ihre Häkchen. Geänderter Text oder ein anderes Schrittsymbol erzeugen eine neue Schrittkennung und damit neue Häkchen für diesen Schritt. Titeländerungen an der Routine selbst lassen deren Schritte bestehen. Änderungen am Wiederholungsmuster können die Zuordnung der bisherigen Tageshäkchen ändern; es werden keine vergangenen Kalendertermine verändert.

Die Daten liegen in neuen Tabellen der bestehenden `/data/submissions.sqlite`, werden zentral gespeichert und bleiben bei normalen App-Updates/Neustarts erhalten. Sie sind eigenständige Daten der Familienküche, keine automatisch angelegten Home-Assistant-To-do-Entitäten. Die Bring-Einkaufsliste bleibt getrennt. App-Daten einschließlich der Datenbank in Home-Assistant-Sicherungen einschließen. Deinstallation mit Datenlöschung entfernt auch diese Einträge.

Auf dem aktiven Aufgaben-Reiter spätestens alle 30 Sekunden aktualisieren. Schreibaktionen werden erst nach bestätigter Speicherung sichtbar. Definition und Fortschritt haben eigene Revisionsprüfungen; Konflikte oder unklare Antworten erfordern Aktualisieren vor der nächsten Änderung. Anfragekennungen und lokale Mutationen werden in derselben SQLite-Transaktion gespeichert; doppelte bestätigte Anfragen werden nicht erneut ausgeführt. Bis zu 200 Aufgaben und Routinen insgesamt. Keine automatische Erinnerung, keine Belohnungspunkte und kein externer Nachrichtendienst in dieser Version.

## Familienfotos und Bildschirmschoner (0.10.0)

**Optionen → Speichern & Fotos verwalten** öffnet das private Album. Fotos können hier auch vom PC oder Handy innerhalb derselben Home-Assistant-Familienküche hochgeladen werden; sie stehen dann auf dem Küchentablet bereit. Keine Bilddateien oder Foto-URLs auf GitHub veröffentlichen. Es werden ausschließlich relative, durch den vorhandenen Home-Assistant-Ingress geschützte Bildadressen verwendet.

Bis zu 20 Bilder, JPEG/PNG/WebP, keine Animationen. Im Browser zunächst auf maximal 1600 × 1000 Pixel verkleinern. Eingabedateien bis 20 MB und 24 Megapixel; ein Mobiltelefonfoto muss gegebenenfalls vorab verkleinert werden. Die API nimmt höchstens 2 MB Binärbild an, prüft das tatsächliche Format, berücksichtigt vorhandene Kameraorientierung und erzeugt ein JPEG bis maximal 1920 × 1080 Pixel. Kamerametadaten werden nicht gespeichert. Fotos liegen als BLOBs in derselben App-Datenbank. Gleiches normalisiertes Bild wird nicht doppelt gespeichert; Entfernen erfordert Bestätigung und lässt Originaldateien auf dem hochladenden Gerät unverändert. Die größte JSON-Anfrage darf 3 MB nicht überschreiten.

Der Ruhemodus zeigt Fotos, Uhr, Datum, aktuelles Wetter, den nächsten laufenden/kommenden zeitgebundenen Termin und das heutige Abendessen. Ganztagstermine bleiben im Kalender. Ohne Fotos oder bei einem nicht ladbaren Bild bleibt eine ruhige gestaltete Ansicht. Rückkehr zum Kalender durch Antippen; Wetter kann weiterhin geöffnet werden. Das Fotoalbum wird im Ruhemodus etwa einmal pro Minute neu gelesen.

Seit **0.11.1** füllt der Ruhemodus die gesamte verfügbare Fläche ohne Außenrand. Bei der normalen Home-Assistant-Ingress-Einbettung mit gleichem Ursprung liegt die Ansicht auch über der HA-Kopfzeile und Seitenleiste. Das gilt sowohl beim manuellen Start als auch nach Inaktivität. Ein Tipp oder Escape öffnet wieder den Kalender; ein Tipp auf das Wetter öffnet dessen Detailansicht. Vorhandene Timer-Hinweise bleiben sichtbar.

Die laufende App bleibt in ihrer ursprünglichen Einbettung; nur die Ruheansicht wird in einer eigenen, durch Shadow DOM isolierten Ebene im übergeordneten Dokument angezeigt. Foto-Adressen bleiben auf den geschützten Ingress-Pfad bezogen. Uhren-, Foto- und Timer-Aktualisierungen werden übernommen. Aufwachen, Navigation, Neuladen und Entfernen der Einbettung entfernen diese Ebene vollständig, ohne HA-Einstellungen zu ändern. Alte WebViews mit Shadow DOM v0 werden ebenfalls berücksichtigt. Wenn der Browser den Zugriff auf das übergeordnete Dokument oder Shadow DOM nicht erlaubt, wird die native HA-Kiosk-Anforderung versucht; deren Unterstützung hängt von der HA-Version ab. Andernfalls bleibt die Ansicht auf den eingebetteten Bereich beschränkt.

Die Android-Status- und Navigationsleiste liegen außerhalb der Webseite. Um auch diese auf dem Fire auszublenden, **Vollbild** in den Einstellungen der Home-Assistant-Android-App aktivieren. Das Dashboard selbst kann diese Systemleisten nicht ausblenden.

Unter **Optionen**: Inaktivität Aus/1/2/5 Minuten, dunkle Ansicht, Foto-Wechsel nach 30/60/120/300 Sekunden, Bildschirm füllen oder ganzes Foto zeigen, optional nächtliches Abdunkeln mit Beginn/Ende (auch über Mitternacht). „Speichern & Vorschau“ aktiviert den Ruhemodus. Gleiches Beginn-/Ende-Zeitfeld bedeutet keine zusätzliche Zeitspanne. Diese Einstellungen bleiben lokal pro Browser/Gerät; das Album ist gemeinsam. Der Browser muss lokale Speicherung erlauben, sonst wird eine Meldung angezeigt.

Das Abdunkeln betrifft die Oberfläche, nicht die physische Hintergrundbeleuchtung. Bildschirmhelligkeit, Display-Ausschalten und Aufwecken weiterhin am Fire-Tablet beziehungsweise einer vorhandenen Kiosk-App einstellen. Offene Dialoge sowie laufende Küchentimer verhindern den automatischen Wechsel in den Ruhemodus. Persönliche Fotos werden nur durch den Home-Assistant-Zugang geschützt; diese Version ergänzt keine eigene Kindersicherungs-PIN.

## Prüfung 0.10.0

Neue Backend-Tests prüfen Tageswiederholungen, einmalige Aufgaben, zukünftige Vorschauen, Konflikte zwischen Geräten, bearbeitete Schritte, Neustart-Persistenz, Dateigrenzen und normalisierte Fotos ohne Metadaten. DOM-Prüfungen decken Vorlagen, Schrittbearbeitung, sichere Textdarstellung, Mitternacht, Foto-Wechsel, nächtliches Abdunkeln und Upload ab.

`python3 -m unittest discover -s tests -v` sowie alle `tests/*.cjs` mit jsdom ausführen. `tests/browser-family.js` benötigt Playwright, Chromium und die Python-Abhängigkeiten. Optional `FAMILY_PLAYWRIGHT_MODULE` / `FAMILY_CHROMIUM` setzen wie bei `tests/browser-kitchen.js`. Der Test startet ausschließlich auf Loopback einen Server mit temporärer Datenbank, deaktiviert dort die Ingress-Prüfung und simuliert die übrigen HA-Daten. Der Produktionsserver behält unverändert seinen Ingress-Schutz. Es werden keine echten HA-/Bring-/Mealie-Daten geschrieben.

Abschlussprüfung: 50 Python-Tests und alle 13 DOM-/Timer-Prüfgruppen bestanden. Browserabläufe für Aufgaben/Routinen/Fotos und für die bestehende Kochansicht mit Wocheneinkauf bei 1280 × 800 und 960 × 600 Pixeln erfolgreich. Tatsächliche Darstellung, Fotoauswahl und Displayverhalten auf dem Fire HD 10 sind nach Installation noch am Gerät zu prüfen.


## Foto-Upload-Korrektur (0.10.1)

Die 0.10.0-Albumansicht ersetzte bei jeder Aktualisierung auch ihr Dateifeld. Bei einer bereits geöffneten nativen Dateiauswahl konnte dadurch das ursprüngliche Feld vom Dokument getrennt werden; dessen späteres Auswahlereignis erreichte die zentrale Verarbeitung dann nicht mehr. Das Dateifeld bleibt nun erhalten, während ausschließlich Status und Galerie aktualisiert werden. Ein direkt am Feld registrierter Handler verarbeitet auch Auswahlereignisse ohne Weiterleitung zum Dokument. Das sichtbare native Dateifeld ersetzt die transparente Überlagerung.

Ein fehlender MIME-Typ oder `application/octet-stream` wird bei .jpg/.jpeg/.png/.webp akzeptiert, ebenso gebräuchliche JPEG-/PNG-Aliase. Das Foto muss weiterhin erfolgreich dekodiert und als JPEG normalisiert werden; alle serverseitigen Bildgrenzen bleiben bestehen. HEIC/HEIF wird mit dauerhaft sichtbarer Export-Anleitung abgelehnt.

Fortschritt nennt Datei und Arbeitsschritt: Lesen, Vorbereiten, Speichern. Nach Abschluss bleibt die Erfolgsbestätigung beziehungsweise der Uploadfehler sichtbar, auch wenn die Albumliste danach erfolgreich neu geladen wird. Ein neuer Auswahlversuch setzt diese Uploadmeldung zurück. Fehler beim synchronen Dateizugriff und Abbruchereignisse werden abgefangen; Lesen und Bildöffnung haben jeweils ein Zeitlimit von 30 Sekunden. Bei ausbleibender Rückmeldung wird die Auswahl wieder freigegeben; verspätete callbacks starten keinen Upload mehr. Die eigentliche HTTP-Schreibanfrage behält das bestehende Zeitlimit und wird nicht automatisch wiederholt.

Prüfung: alle 14 DOM-/Timer-Prüfgruppen bestanden, neue Upload-Regressionstests für Feldidentität, ältere Auswahlereignisse, fehlenden Dateityp, sichtbare Fehler, blockierten Dateizugriff, überlappende Leseanfragen und Zeitüberschreitung. Chromium hat eine native Dateiauswahl geöffnet, während eine echte lokale Albumantwort verzögert wurde; anschließend Upload ohne Bild-MIME, normalisierte Bildausgabe, dauerhafte Formatfehlermeldung und Entfernen erfolgreich geprüft. Testserver und Bilder waren lokal und temporär, ohne echte Home-Assistant-Schreibvorgänge. Die konkrete Dateiauswahl auf dem Fire muss nach dem Update noch am Gerät bestätigt werden.


## Smartphone-Fotoauswahl (0.10.2)

Die Home-Assistant-Android-App hatte in bestimmten Versionen ein separates Problem bei Dateifeldern mit `multiple`: Einige Android-Dateianbieter liefern dabei auch eine einzelne Auswahl als `ClipData`, die von der damaligen App nicht übernommen wurde. Die Seite erhält dann keine Datei; JavaScript kann diese fehlende native Übergabe nicht rekonstruieren. Das Problem ist im offiziellen Projekt dokumentiert: https://github.com/home-assistant/android/issues/7548 (einschließlich Bestätigung für den Google Photo Picker). Die ältere Implementierung ist unter https://github.com/home-assistant/android/blob/2026.8.4/app/src/main/kotlin/io/homeassistant/companion/android/frontend/filechooser/FileChooserEffect.kt nachvollziehbar. Neuere App-Implementierungen wurden geändert; der Workaround verlangt kein Companion-App-Update.

Die Familienküche verwendet jetzt ein natives Einzeldateifeld mit `accept="image/*"` ohne Mehrfachauswahl. **Jeweils ein Foto wählen**; weitere Fotos danach einzeln hinzufügen. Das Album bleibt auf insgesamt 20 Fotos begrenzt. JPEG/PNG/WebP werden unverändert geprüft und normalisiert; andere Bildformate, etwa HEIC/HEIF, erhalten weiter eine sichtbare Formatmeldung.

Zusätzlich wird das Dateifeld beim Start der Verarbeitung nicht mehr geleert. Damit bleibt die native Auswahl während des Dateizugriffs und nach bestätigtem Upload sichtbar. Der Albumdialog zeigt den gewählten Dateinamen auch in einer eigenen Zeile. Eine leere Auswahlrückgabe bzw. ein natives Abbruchereignis ohne Datei wird sichtbar gemeldet. Bei Problemen mit der nativen Übergabe kann die Familienküche alternativ im Smartphone-Browser oder am PC geöffnet werden; das Album ist gemeinsam.

Prüfung: alle 14 DOM-/Timer-Suites erfolgreich. Regressionstests prüfen fehlendes `multiple`, den Bildfilter und das Erhalten des nativen Dateiwerts bis nach dem Upload; der alte Code scheitert an dieser Prüfung. Chromium prüfte zusätzlich bei 412 × 915 Pixeln mit Touch-/Mobilmodus den tatsächlichen FileChooser im Einzeldatei-Modus, einen echten lokalen Upload, den erhaltenen nativen Dateinamen und den Eintrag im Album. Es wurde keine echte Home-Assistant-Android-WebView und kein physisches Smartphone gesteuert; die Geräteabnahme bleibt nach dem Update erforderlich. Die übrigen Browserabläufe für Aufgaben/Routinen, Fotos und Tablet-Darstellung sind ebenfalls erfolgreich geblieben.

Auch der Dialog wird jetzt – bei vorhandener VisualViewport-API – an Breite, Höhe und Position des tatsächlich sichtbaren Browserbereichs ausgerichtet. Die Tablet-Oberfläche darf weiterhin breiter als ein Telefon sein; der Foto-Dialog bleibt davon unabhängig im sichtbaren Bereich und erhält bei Platzmangel einen eigenen Scrollbereich. Die Smartphone-Browserprüfung kontrolliert dafür zusätzlich die tatsächlichen Dialoggrenzen gegen den sichtbaren Viewport.


## Erinnerungen und Vorschau (0.11.0)

Die **Glocke** in der Kopfzeile und **Optionen → Erinnerungen einstellen** öffnen drei Bereiche: Vorschau, Regeln und Smartphones. Auf dem Handy den Optionen-Einstieg verwenden; das Hauptlayout bleibt auf das Küchentablet ausgelegt. Die Vorschau zeigt die nächsten 14 Tage, unabhängig davon, welche Kalenderwoche gerade geöffnet ist.

Beim ersten Start ist **automatischer Handy-Versand ausgeschaltet**. Es werden keine Testnachrichten oder automatischen Push-Nachrichten allein durch Öffnen der Seite oder Aktualisieren verschickt. Die Hintergrundprüfung liest bereits die konfigurierten Kalender und berechnet Hinweise; fällige Hinweise erscheinen auch als kompakte Karte über dem Kalender.

Standardregeln:

- Müllabfuhr aus dem bereits konfigurierten Müllkalender: Vorabend um 18:00 Uhr. Die Uhrzeit ist änderbar. Es gibt keinen Push mehr ab Beginn des Abholtages, da die tatsächliche Abholzeit bei Ganztagseinträgen nicht bekannt ist.
- Zeitgebundene Termine von Tina und Jörn: 30 Minuten vorher, wählbar 5/10/15/30/60/120 Minuten. Personen einzeln abschaltbar.
- Ganztagstermine aus den Personenkalendern, Geburtstage, Feiertage und eigene Aufgaben/Routinen lösen in dieser ersten Version keine Erinnerungen aus.
- Ruhezeit zunächst 22:00–07:00 Uhr. Fälligkeiten innerhalb dieses Fensters verschieben sich auf dessen Ende. Ist dann der Termin bereits gestartet bzw. der Abholtag begonnen, entfällt der Hinweis. Die Vorschau kennzeichnet solche Fälle. Gleiche Start-/Endzeit bedeutet keine Ruhezeit.

**Schließen** gilt gemeinsam für die Familie und blendet nur den Hinweis aus. Kein Kalendertermin wird gelöscht. **10/30 Minuten später** verschiebt die Fälligkeit um diesen Zeitraum ab dem späteren Zeitpunkt aus jetzt oder bisheriger Fälligkeit; eine zukünftige Erinnerung wird dadurch niemals vorgezogen. Eine Verschiebung über ihre Ablaufgrenze ist nicht möglich. Wenn automatischer Versand später aktiviert ist, kann eine ausdrücklich verschobene Erinnerung erneut einen Push erzeugen. Geschlossene Hinweise stehen im Vorschau-Bereich unter „Geschlossen“, solange der zugehörige Termin noch nicht begonnen hat.

### Handy-Ziele einrichten und gezielt testen

Es werden nur vorhandene `notify.mobile_app_*`-Aktionen zur Auswahl angeboten, keine Lautsprecher, Gruppen oder allgemeinen Notify-Ziele. Die Ziele werden über die Home-Assistant-Dienste entdeckt; es stehen keine privaten Gerätenamen oder Zugangsdaten im öffentlichen Quellcode.

1. Unter **Smartphones** beim gewünschten Gerät **Testnachricht senden** wählen. Das öffnet zuerst eine Übersicht, noch ohne Versand.
2. **Jetzt Test senden** beauftragt genau eine Nachricht an dieses Gerät. Mindestens eine Minute Abstand zwischen zwei Tests pro Ziel. Ein Fehler oder eine unklare Antwort wird angezeigt, ohne automatischen Neuversuch.
3. Erst auf dem Gerät nachsehen, dann **Ist angekommen** drücken. Eine erfolgreiche Home-Assistant-Antwort allein wird nicht als tatsächlicher Empfang gewertet.
4. Das bestätigte Gerät anhaken und **Zielauswahl speichern**. Bis zu vier Ziele sind möglich; alle ausgewählten Geräte erhalten alle gewählten Müll-/Terminregeln. Es gibt noch keine automatische Zuordnung einer Person zu einem bestimmten Handy.
5. Erst unter **Regeln** kann **Automatische Handy-Erinnerungen aktivieren** eingeschaltet werden. Ohne ausgewähltes und bestätigtes Gerät ist die Aktivierung nicht möglich.

Aktivieren versendet keinen Rückstau vorher fälliger Erinnerungen. Nach einem Neustart bleibt die letzte Aktivierung bestehen; eine während des Ausfalls neu fällig gewordene Erinnerung kann noch gesendet werden, solange ihre Ablaufgrenze nicht erreicht ist. Wird eine Nachricht von HA angenommen, steht „An Home Assistant übergeben“. Dies ist keine technische Zustellbestätigung des Telefons. Benachrichtigungsrechte, Verbindung und Android-Energiespareinstellungen beeinflussen die tatsächliche Zustellung.

### Zentrale Verarbeitung und Persistenz

Ein Hintergrundprozess in der Familienküche auf dem NUC prüft ungefähr jede Minute und bei Regeländerungen. Dazu müssen Tablet und Browser nicht geöffnet sein. Der NUC und Home Assistant müssen laufen. Die tatsächliche Prüfung kann bei langsamen Kalenderantworten später erfolgen; Änderungen sind erst berücksichtigt, wenn Home Assistant sie über seine Kalender-API liefert.

Neue Tabellen in `/data/submissions.sqlite` halten Regeln, Bestätigungen, geschlossene/verschobene Hinweise und Versandversuche. Keine zusätzlichen HA-Automationen oder Helfer werden angelegt. Die App verwendet für Push die native `notify.mobile_app_*`-Aktion, nicht die ähnlich benannte Notify-Entität. Vor jedem Versand wird der Versuch festgehalten. Nach unklarer Antwort oder einem Neustart mit offenem Versandversuch wird nicht automatisch erneut gesendet. Das vermeidet doppelte Nachrichten, kann bei unklaren Fehlern aber bedeuten, dass ein einzelner Hinweis ausbleibt; der Status bleibt sichtbar.

Fällt ein Kalender aus, bleiben seine zuletzt berechneten Einträge als veraltet erkennbar; aus ihnen wird nicht gesendet. Erfolgreiche Aktualisierungen entfernen abgesagte Einträge aus der Vorschau. Geänderte Uhrzeiten erzeugen neue Vorkommen. Bei vorhandener Kalender-UID bleibt die Kennung trotz Titeländerung stabil, sodass eine bereits versandte Erinnerung nicht erneut ausgelöst wird. Ohne UID dient Titel plus Terminbeginn als Ersatzkennung; eine Titeländerung kann dann als neuer Eintrag gelten. Diese Identität hängt von den durch HA gelieferten Kalenderdaten ab.

Regel- und Hinweisänderungen prüfen Revisionen, damit zwei Geräte nicht unbemerkt ältere Änderungen zurückschreiben. Bearbeitungsfelder bleiben während normaler Hintergrundaktualisierung erhalten. Datum/Uhrzeiten für Erinnerungen werden ausdrücklich in Berlin dargestellt. Nicht existierende Zeiten im Frühjahr werden zur ersten gültigen Minute verschoben; doppelte Uhrzeiten im Herbst erzeugen dank gespeicherter Kennungen keinen zweiten automatischen Versand. Verschiebungen um Minuten rechnen mit tatsächlich verstrichener Zeit über die Zeitumstellung hinweg.

Aufbewahrung: nicht mehr gesehene Erinnerungen etwa sieben Tage, Versandversuche etwa 90 Tage. Die Vorschau zeigt höchstens 100 aktuelle Einträge, kennzeichnet eine Kürzung und zeigt die letzten 20 Versandversuche. Maximal 2000 gelieferte Ereignisse pro Kalender und Abruf; unlesbare Daten führen zu einem Hinweis, keinem Versand aus ungeprüften Datensätzen.

APIs: `GET api/reminders` für Stand/Vorschau und `POST api/reminders/actions` für Regeln, Schließen, Verschieben, Aktualisieren, Test und Empfangsbestätigung. Alle Schreibanfragen behalten den bestehenden Ingress-, JSON- und Anfragekennungsschutz. Ein erfolgreicher Test aktiviert niemals selbst den automatischen Versand.

### Prüfung 0.11.0

Neue Backend-Prüfungen decken Vorschau ohne Versand, Test-Idempotenz, manuelle Empfangsbestätigung vor Aktivierung, fehlende Ziele, ruhige Zeiten, beide Zeitumstellungen, abgelaufene/abgesagte Termine, Kalenderverschiebungen, Einzelversand pro Ziel, unbestätigte Antworten, Neustart-Persistenz und Verschieben/Schließen ab. DOM-Prüfungen testen den vollständigen Aktivierungsablauf ohne tatsächlichen Versand und den Erhalt von Eingaben.

`tests/browser-reminders.js` startet denselben ausschließlich lokalen Testserver wie die Foto-/Familienprüfung und verwendet einen vollständig nachgebildeten Handy-Dienst. Vor dem ausdrücklichen Test-Klick bleibt dessen Zähler null; nach Test/Empfangsbestätigung und Zielauswahl bei weiterhin deaktiviertem Automatikmodus genau eins. Echte Smartphones werden in diesen Tests nicht angesprochen. Playwright-/Chromium-Pfade können wie bei den vorhandenen Browserprüfungen über `FAMILY_PLAYWRIGHT_MODULE` und `FAMILY_CHROMIUM` angegeben werden.

Abschlussstand 0.11.0: alle 62 Backend-Tests und 15 DOM-/Timer-Prüfgruppen erfolgreich. Erinnerungsablauf und bestehende Aufgaben-/Routinen-/Fotoabläufe in Chromium bei 1280×800, 960×600 und in der Smartphone-Ansicht bei 412×915 geprüft. Die echten vorhandenen Mobile-App-Aktionen wurden ausschließlich lesend ermittelt; es wurden keine realen Test- oder Kalendernachrichten versendet. Installation, Prüfung der echten Kalender-Vorschau und ein vom Nutzer ausgelöster Test auf dem tatsächlichen Smartphone stehen nach dem Update noch aus.


### Prüfung 0.11.1

`tests/browser-saver.js` prüft eine lokale HA-ähnliche Einbettung mit eigener Kopfzeile, Seitenleiste und iframe im Shadow DOM: vollständige Bildschirmabdeckung bei 1280×800, 960×600 und 412×915; Fotos aus dem richtigen Ingress-Pfad; Uhraktualisierung; Tippen, Escape und Wetterdialog; Bereinigung bei Navigation, iframe-Neuladen und Entfernen; automatischer Start nach Inaktivität; Timer-Hinweise und direkt geöffnete Ansicht. Kein echter HA-Schreibzugriff. Zusätzlich bestehende DOM-/Timer-Prüfungen und den Aufgaben-/Foto-Browsertest ausführen. Die abschließende Prüfung auf dem Fire-Gerät erfolgt nach Installation des Updates.


### Flackerfreie Fotos (0.11.2)

Aktualisierungen von Uhr, Wetter, Kalender und Album ändern nur die betroffenen Texte und Attribute. Das sichtbare Foto bleibt sowohl in der App als auch in der HA-Vollbildfläche als dasselbe Bildelement montiert. Ein neues Foto wird vor dem Wechsel geladen; bei langsamen oder fehlerhaften Anfragen bleibt das bisherige Bild sichtbar. Überholte Ladeantworten dürfen kein neueres Foto überschreiben.

`tests/saver-render.cjs` prüft Bildbeständigkeit, Vorladen, Wiederverwendung einer laufenden Anfrage, Fehler, verspätete Antworten und Beenden während des Ladens. `tests/browser-saver.js` prüft zusätzlich die Identität der tatsächlich sichtbaren Bildelemente nach Uhr-, Kalender-, Album- und Größenaktualisierungen im eingebetteten Bereich und in der HA-Vollbildfläche. Alle 16 DOM-/Timer-Prüfgruppen und der Vollbild-Browsertest bestanden. Das Verhalten auf dem physischen Fire-Tablet ist nach dem Update zu prüfen.


## Personenfotos, Kalenderfilter und Farben (0.12.0)

Oben im Kalender stehen **Familie, Tina, Jörn und Felix**. Eine Person antippen, um nur die ihr zugeordneten Termine zu sehen. Erneutes Antippen derselben Person behält diese Auswahl; **Familie** zeigt wieder alles. Die Auswahl gilt in Woche, Monat, Liste und den jeweiligen Tagesdetails. Auch der Hinweis auf den nächsten Termin im Kalender berücksichtigt sie. Der Ruhemodus zeigt weiterhin den nächsten Familientermin. Beim Neuladen beginnt der Kalender mit Familie.

Müllabfuhr, Geburtstage und Feiertage sind gemeinsame Einträge und stehen unter Familie. Die Auswahl ändert keine Kalenderdaten. Felix hat weiterhin keinen eigenen angeschlossenen Kalender; seine Auswahl enthält derzeit keine eigenen Termine. Namen und Kalender-Zuordnungen bleiben die vorhandenen festen Profile.

Unter **Optionen → Personen & Farben** die Person wählen. Über **Foto auswählen** ein einzelnes JPEG-/PNG-/WebP-Bild hochladen. Das Gesicht sollte möglichst in der Mitte liegen: Das Foto wird mittig quadratisch zugeschnitten, auf 320×320 Pixel normalisiert und rund dargestellt. Ein weiteres Foto ersetzt das bisherige; **Foto entfernen** stellt die Initialen wieder her. Die Profilfotos liegen getrennt vom Familien-Bildschirmschoner-Album in der App-Datenbank und zählen nicht zu dessen 20 Bildern. Upload verwendet dieselbe Android-kompatible Einzeldatei-Auswahl und Verkleinerung wie das bestehende Album. Kamerametadaten werden entfernt; die Fotos werden nicht auf GitHub veröffentlicht.

Eine eigene Farbe über die Farbauswahl oder die Palette wählen und **Farbe speichern** drücken. Der Farbton wird erst nach bestätigter Speicherung für Fotoringe und vorhandene Personenkennzeichnungen übernommen. Terminflächen erhalten eine helle Abstufung und dunkle Schrift. Auch Familie besitzt eine eigene Farbe. Andere bereits geöffnete Geräte lesen Profile etwa einmal pro Minute neu; Neuladen übernimmt Änderungen ebenfalls. Fotos und Farben bleiben nach App-Neustarts erhalten.

Die Profilverwaltung verändert beim Nachladen nur Status und Vorschaubereich; der native Dateipicker bleibt bestehen. Änderungen verwenden Revisionsnummern. Nach einem Konflikt oder unbestätigtem Speichern zuerst **Aktualisieren**, den angezeigten Stand prüfen und die gewünschte Änderung erneut ausführen. Die App überschreibt solche Konflikte nicht automatisch.

### Prüfung 0.12.0

67 Python-Backendtests und 17 DOM-/Timer-Prüfgruppen erfolgreich. Neue Backendprüfungen decken Farben, ungültige Eingaben, Revisionen, doppelte Anfragen, Avatar-Normalisierung, Kamerametadaten, getrenntes Fotoalbum, Austausch/Entfernen und Neustart-Persistenz ab. `tests/profiles-frontend.cjs` prüft bestätigte Schreibvorgänge, Konflikte, sichere Bildpfade, Initialen und erhaltene native Dateifelder.

`tests/browser-profiles.js` prüft die drei Kalenderansichten einschließlich Monatsdetails, Personen-/Familienauswahl, Farben, Bild-Upload mit fehlendem Dateityp, Smartphone-Einzeldatei-Picker und Übernahme auf einem zweiten Gerät mit echtem lokalem temporärem Backend. Layout bei 1280×800 und 960×600 sowie Profilverwaltung bei 412×915 geprüft. Bestehende Aufgaben-/Routinen-/Fotoalbum-Abläufe und der flackerfreie Vollbild-Ruhemodus ebenfalls im Browser geprüft. Alle HA-Daten sind dabei simuliert; keine realen Kalender, Fotos, Benachrichtigungen oder Mealie-Daten verändert. Prüfung auf dem physischen Fire nach Installation steht aus.


## Grafische Auswahl bei Aufgaben und Routinen (0.12.1)

Aufgaben und Routinen verwenden dieselbe Personenleiste wie der Kalender: **Familie, Tina, Jörn und Felix**, mit den bereits gespeicherten Bildern und Farben. Eine Person zeigt die ihr zugewiesenen Einträge, Familie alle Einträge. Die Auswahl der Aufgaben-/Routinenansicht ist von der Kalenderauswahl unabhängig. Zugewiesene Personen erscheinen außerdem als kleine Bilder auf den Einträgen und Karten sowie im Kopf der geöffneten Routine.

Beim **Anlegen und Bearbeiten** unter **Für wen?** auf das passende Bild tippen. Die aktuelle Person ist mit Ring und hervorgehobenem Namen markiert. Eine neue Aufgabe oder Routine übernimmt zunächst die gewählte Personenansicht; Vorlagen für Felix behalten ihre vorhandene Zuordnung. Ein zusätzliches Bildhochladen ist nicht notwendig: Die Profile bleiben zentral unter Optionen → Personen & Farben verwaltet.

Unter **Symbol** eine der zwölf Kacheln mit Zeichnung und Beschriftung wählen. Die aktive Kachel ist hervorgehoben. Bei einem Routine-Schritt zeigt **Symbol ändern** bereits das aktuelle Symbol; Antippen öffnet die grafischen Kacheln direkt im Formular. Die Wahl wird übernommen und die Schrittauswahl schließt sich wieder. Texte und andere Angaben bleiben erhalten. Keine nativen Dropdowns mehr für Personen oder Symbole in diesen Formularen.

Fotos und Farben können auch bei einem geöffneten Aufgabenentwurf von anderen Geräten übernommen werden. Dabei werden nur die Personenbilder erneuert; die Eingaben im Entwurf bleiben bestehen. Schreiben, Konfliktprüfung und die bisherigen Regeln zum Fortschritt geänderter beziehungsweise unveränderter Routine-Schritte bleiben erhalten. Profilfotos ohne erreichbares Bild verwenden weiterhin die Initialen.

### Prüfung 0.12.1

Alle 17 DOM-/Timer-Prüfgruppen erfolgreich. Erweiterte Aufgaben- und Profilprüfungen decken gemeinsame Bildkomponenten, unabhängige Filteraktionen, Zuordnung per Bild, grafische Haupt-/Schrittsymbole, Formularwerte, Auswahlmarkierung, Entwurfserhalt und bestehende Konflikt-/Fortschrittsabläufe ab.

`tests/browser-family-pickers.js` verwendet ausschließlich einen lokalen Testserver mit temporärer Datenbank und generierten Testporträts. Geprüft: dieselben Bildadressen und Farben wie im Kalender, Aufgaben anlegen/neu zuordnen, Routinen-Schrittsymbole erstellen/bearbeiten, gespeicherte Werte und erhaltene Häkchen unveränderter Schritte, Live-Profilaktualisierung ohne Entwurfsverlust, Tabletgrößen 1280×800/960×600 und der grafische Editor in schmaler Smartphone-Ansicht. Bestehender Aufgaben-/Routinen-/Fotoalbum-Browsertest und Kalender-/Profil-Browsertest ebenfalls erfolgreich. Keine Backendänderung, daher Backendtests nicht erneut ausgeführt. Prüfung auf dem physischen Fire nach dem Update steht aus.


### Passende Wettersymbole (0.12.2)

Alle 15 standardmäßigen Home-Assistant-Wetterzustände erhalten eine eigene SVG-Zeichnung. Regen zeigt Tropfen, Nebel horizontale Nebelstreifen, Schnee Schneeflocken, Gewitter einen Blitz und Wind Windlinien. Text und Symbol werden aus demselben Eintrag erzeugt. Kopfbereich, Wetterdialog und Tagesvorhersage sowie der Ruhemodus verwenden dieselbe Zuordnung. Unbekannte Zustände zeigen ein neutrales Fragezeichen mit „Wetterlage nicht angegeben“. Temperaturwerte, Wetterquelle und Aktualisierungsintervalle bleiben unverändert.

Alle17 DOM-/Timer-Prüfgruppen erfolgreich. Der Wettertest prüft insbesondere die gemeldete Folge Bewölkt/Regen/Nebel/Nebel/Regen, übereinstimmende Symbole und Texte für alle15 Zustände sowie unbekannte und ungültige Angaben. `tests/browser-weather.js` prüft diese Vorhersage, Kopfbereich, aktuelle Wetteränderungen, Nebel im Ruhemodus und Gewitter mit Regen bei1280×800/960×600 mit lokal simulierten Wetterdaten. Keine realen HA-Daten verändert. Auf dem physischen Fire nach Update noch zu prüfen.
