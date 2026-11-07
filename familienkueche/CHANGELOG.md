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
