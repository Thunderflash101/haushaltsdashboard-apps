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

### Mit einem Tipp planen

Jeder Vorschlag bietet die sieben Wochentage der angezeigten Woche. Ein freier heutiger oder zukünftiger Tag lässt sich direkt antippen; dieser Klick speichert das Gericht als Abendessen in Mealie. Es gibt keinen zusätzlichen Bestätigungsdialog. Vergangene und bereits belegte Tage sind deaktiviert. Vorhandene Gerichte über die bestehende Funktion „Tauschen“ bearbeiten. Vor dem Schreiben prüft der Server den geladenen Tagesstand erneut. Doppelklicks und unklare Bestätigungen lösen keine automatische Wiederholung aus; bei Unsicherheit zuerst aktualisieren und den Stand in Mealie prüfen.

Tests decken Metadaten, Zeitformate, die genaue 30-Minuten-Grenze, kombinierte Filter, Gewichtung, unvollständige Historie, Tageswahl und die Schreibschutzfälle ab. Rezeptmerkmale und ein vergangener Essensplan wurden erfolgreich aus der echten Mealie-Installation gelesen. Es wurden keine willkürlichen Rezepte als Favorit markiert und keine Testgerichte eingeplant. Chromium wurde lokal versucht, konnte in dieser Laufzeit jedoch nicht erfolgreich starten; Browserdarstellung und echtes Planen sind auf dem Tablet nach dem Update zu prüfen.

Zusätzliche Prüfung: `NODE_PATH=<node_modules> node tests/suggestions-frontend.cjs`.
