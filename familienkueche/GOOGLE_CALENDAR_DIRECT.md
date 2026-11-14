# Termine direkt bearbeiten und verschieben

Ab Familienküche 0.18.0 lassen sich vorhandene Termine aus **Jörns zugeordnetem Google-Kalender** im Dashboard ändern: Titel, Beginn/Ende, ganztägig, Ort und Beschreibung. Ein Kalendertermin bleibt derselbe Termin; er wird nicht gelöscht und neu angelegt. Serien werden zunächst **nur für das angeklickte einzelne Vorkommen** bearbeitet. Ganze Serien und fremd organisierte Einladungen bleiben in Google Kalender bearbeitbar. Tinas importierter iCal-Kalender bleibt hier lesbar.

Home Assistants Google-Kalender bietet derzeit keine direkte Aktualisierung vorhandener Termine. Die Familienküche verwendet dafür nach einmaliger Einrichtung die offizielle Google Calendar API. Die bestehende HA-Anbindung bleibt erhalten; Anlegen und Lesen funktionieren auch ohne diese Einrichtung wie bisher.

## 1. Google-Projekt und OAuth-Client

Das vorhandene Google-Cloud-Projekt der Google-Kalender-Integration kann weiterverwendet werden. Es ist kein OpenAI-Projekt. In der [Google Cloud Console](https://console.cloud.google.com/) das passende Projekt auswählen und prüfen, dass die **Google Calendar API** aktiviert ist.

Unter **Google Auth Platform → Clients** einen zusätzlichen OAuth-Client vom Typ **Web application / Webanwendung**, zum Beispiel „Familienküche“, anlegen. Bei älterer Oberfläche heißt der Bereich **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID**.

Als **Authorized redirect URI / Autorisierte Weiterleitungs-URI** genau eintragen:

```text
https://developers.google.com/oauthplayground
```

Client-ID und Client-Secret privat aufbewahren. Den bisherigen HA-Client und dessen Weiterleitungsadressen unverändert lassen. Für diese Einrichtung wird kein öffentlich erreichbarer NUC und kein eigener OAuth-Rückrufserver benötigt.

Im Einwilligungsbildschirm beziehungsweise unter **Audience / Zielgruppe** den eigenen Google-Nutzer zulassen. Bei externen Apps im Status **Testing** laufen Google-Freigaben mit Kalenderrechten typischerweise nach sieben Tagen ab. Für dauerhaften privaten Betrieb ist der Status **In production / In Produktion** erforderlich; Google kann weiterhin Hinweise oder Freigabeschritte anzeigen. Widerrufene Zugriffe und geänderte Google-Richtlinien können eine erneute Freigabe erfordern.

## 2. Einmalig bei Google freigeben

Den offiziellen [Google OAuth Playground](https://developers.google.com/oauthplayground/) öffnen. Im Zahnrad:

- **OAuth flow:** Server-side
- **OAuth endpoints:** Google
- **Access type:** Offline
- **Force prompt:** Consent Screen
- **Use your own OAuth credentials:** aktivieren; die eben angelegte eigene Client-ID und das Client-Secret eintragen.

Eigene OAuth-Zugangsdaten sind hier wichtig: Mit den Standard-Zugangsdaten des Playgrounds werden Refresh-Tokens nach 24 Stunden widerrufen. Ein Playground-Freigabelink mit eingebetteten Zugangsdaten oder Tokens darf nicht geteilt werden.

Unter **Step 1 / Select & authorize APIs** genau diese beiden Berechtigungen auswählen beziehungsweise als eigene Scopes eintragen:

```text
https://www.googleapis.com/auth/calendar.events.owned
https://www.googleapis.com/auth/calendar.calendarlist.readonly
```

**Authorize APIs** wählen und mit dem Google-Konto anmelden, dem Jörns Kalender gehört. Die erste Berechtigung ermöglicht Terminänderungen in eigenen Kalendern; die zweite liest Kalendernamen und die Zugehörigkeit. Die Familienküche bearbeitet ausschließlich den eingestellten Kalender und einen zuvor eindeutig zugeordneten Termin.

In **Step 2 / Exchange authorization code for tokens** auf **Exchange authorization code for tokens** klicken. Benötigt wird das Feld **Refresh token**, nicht der kurzlebige **Access token**. Falls kein Refresh-Token erscheint, die Offline-/Consent-Einstellungen prüfen und erneut freigeben.

Die Google-Anmeldung erfolgt nur für diese Freigabe. Im normalen Betrieb erneuert die App kurzlebige Zugriffstokens serverseitig anhand dieses Refresh-Tokens.

## 3. In Home Assistant hinterlegen

In Home Assistants vorhandener `secrets.yaml` diese drei zusätzlichen Einträge setzen. Die Werte unten sind nur Platzhalter; vorhandene Einträge beibehalten. Die echte Datei und echte Tokens niemals in Chat, Screenshots oder GitHub veröffentlichen.

```yaml
familienkueche_google_client_id: "DEINE-CLIENT-ID.apps.googleusercontent.com"
familienkueche_google_client_secret: "DEIN-CLIENT-SECRET"
familienkueche_google_refresh_token: "DEIN-REFRESH-TOKEN"
```

In **Einstellungen → Apps → Familienküche → Konfiguration** zusätzlich einstellen:

```yaml
google_calendar_edit_enabled: true
google_calendar_edit_id: "primary"
```

`primary` bedeutet den Hauptkalender des gerade freigegebenen Google-Kontos. Wenn Jörns HA-Kalender stattdessen einen weiteren eigenen Google-Kalender anzeigt, dessen Kalender-ID eintragen. Sie steht in Google Kalender unter **Einstellungen → Einstellungen für meine Kalender → gewünschter Kalender → Kalender integrieren → Kalender-ID**. Die ID ist keine Home-Assistant-Entitäts-ID. Unterstützt werden eigene Kalender mit Eigentümerrecht; fremde oder nur freigegebene Kalender bleiben hier ausgeschlossen.

Die App besitzt bereits die schreibgeschützte Einbindung von Home Assistants Konfigurationsverzeichnis. Kein Home-Assistant-Core-Neustart und keine Änderung von `configuration.yaml` sind nötig. **Familienküche neu starten** und die Dashboardseite neu laden.

## 4. Verbindung prüfen und benutzen

In der Familienküche **Optionen → Kalender direkt bearbeiten einrichten → Verbindung prüfen** öffnen. Angezeigten Kalendernamen und Kalender-ID mit Jörns gewünschtem Kalender vergleichen. Diese Prüfung liest nur die Verbindung; sie verändert keine Termine.

Einen Termin von Jörn öffnen und **Bearbeiten / Verschieben** wählen. Die App liest den aktuellen Google-Stand, statt alte Tablet-Daten zu überschreiben. Über Datum und Uhrzeit oder die Tasten **1 Tag früher**, **1 Tag später**, **1 Woche später** und **30 Min. später** verschieben.

**Änderungen prüfen** zeigt Vorher/Nachher und mögliche Überschneidungen in Jörns gewähltem Kalender. Erst **In Google speichern** beziehungsweise **Trotz Überschneidung speichern** schreibt die Änderung. Bei ganztägigen Terminen zählt der im Formular gewählte Endtag mit. Gäste, bestehende Google-Erinnerungen und Konferenzdaten bleiben erhalten; die App verschickt keine Einladungs-E-Mails. Bei Änderungen an einem Termin mit Gästen sollten diese bei Bedarf gesondert informiert werden.

Ändert ein anderer Client den Termin zwischen Laden und Speichern, verhindert die Google-Versionsprüfung ein Überschreiben. Bei unklarer Speicherbestätigung den Google-Kalender prüfen und den Termin neu öffnen; nicht mehrfach speichern. Die App wiederholt unklare Änderungen nicht automatisch. Nach erfolgreichem Speichern fordert sie Home Assistant zum Aktualisieren auf; dessen Kalendercache kann verzögert nachziehen.

## Häufige Fälle

- **Direkte Bearbeitung ausgeschaltet / Zugang fehlt:** App-Option und die drei exakt benannten Secret-Einträge prüfen, dann die Familienküche neu starten.
- **Freigabe abgelaufen / Berechtigung fehlt:** eigenes OAuth-Konto, Offline-Freigabe und beide Scopes prüfen. Auch ein Google-Projekt im Teststatus kann die kurze Laufzeit verursachen.
- **Kalender gehört nicht dem angemeldeten Nutzer:** Google-Konto oder Kalender-ID korrigieren. Ein freigegebener Kalender mit Schreibrecht reicht für diese erste Version nicht aus.
- **Google und HA zeigen unterschiedliche Daten:** In Google und HA aktualisieren und den Termin neu öffnen. Es wird kein Termin nur anhand seines Titels verändert.
- **Anderer Organisator / spezieller Termin:** über den weiterhin vorhandenen Google-Kalender-Link bearbeiten. Automatische Geburtstage, Abwesenheits-/Fokuszeitblöcke und ganze Serien werden hier nicht verändert.
- **Anzeigen sehr langer Termine oder fehlende eindeutige Kennung:** in Google bearbeiten; Dashboard-Bearbeitung ist auf höchstens 366 Tage und eindeutige Zuordnung begrenzt.

## Technische Quellen

- [Home Assistant Google Calendar](https://www.home-assistant.io/integrations/google/)
- [Google OAuth Playground](https://developers.google.com/oauthplayground/)
- [Offline-Zugriff und Refresh-Tokens](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google Calendar: Kalenderzuordnung](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/get)
- [Google Calendar: Termin teilweise aktualisieren](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch)
- [Google Calendar: Versionsprüfung mit If-Match](https://developers.google.com/workspace/calendar/api/guides/version-resources)
