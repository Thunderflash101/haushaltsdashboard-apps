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

Der Reiter Einkauf liest offene und erledigte Einträge direkt aus Home Assistant. Artikel können ergänzt, abgehakt, wieder geöffnet, umbenannt und nach einer Einzelbestätigung entfernt werden. Die Anzahl offener Einträge erscheint an der Navigation. Die verfügbaren Schaltflächen richten sich nach den Fähigkeiten der gewählten Liste. Mengen können vorerst im Artikelnamen stehen; eine separate Portions- und Zutatenübernahme folgt später.

Die Liste wird beim Öffnen, über Aktualisieren und im geöffneten Reiter spätestens alle 30 Sekunden nachgeladen. Außerhalb des Reiters wird der Zähler mit der allgemeinen Aktualisierung erneuert. Es gibt keinen Push-Kanal; Änderungen anderer Geräte erscheinen nach dem nächsten Abruf. Textentwürfe und die Scrollposition bleiben beim Nachladen erhalten.

Schreibvorgänge beziehen sich auf die eindeutige Eintrags-ID. Vorher wird geprüft, ob der Eintrag seit dem Laden geändert wurde; bei einem erkannten Konflikt zuerst aktualisieren. Die Prüfung ist keine atomare Sperre anderer HA-Clients. Gleiche offene Artikelnamen werden beim Hinzufügen als bereits vorhanden gemeldet. Erfolgreiche und ungewisse Anfragekennungen werden wie bei Kalender und Mealie gespeichert, sodass derselbe Vorgang nicht versehentlich wiederholt wird. Die UI bestätigt Änderungen erst nach der Dienstantwort. Bei Verbindungsproblemen bleiben letzte Daten sichtbar und als veraltet markiert; es gibt keine Offline-Schreibwarteschlange.

Echte Lesetests mit der vorhandenen Liste waren erfolgreich. Automatisierte Backend- und DOM-Prüfungen decken Hinzufügen, Statuswechsel, Wiederherstellen, Umbenennen, Entfernen, Konflikte, Doppelklicks und Verbindungsfehler ab. Es wurden keine Testartikel in die echte Liste geschrieben. Nach dem App-Update die Synchronisierung auf dem Tablet und in Home Assistant mit einem selbst gewählten Artikel prüfen.

Zusätzliche DOM-Prüfung: `NODE_PATH=<node_modules> node tests/shopping-frontend.cjs`.
