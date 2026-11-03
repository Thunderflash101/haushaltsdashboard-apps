# Einmaliger Wechsel von der lokalen zur Repository-App

Diese Anleitung beschreibt die Migration von der lokalen App 0.1.0. Die erste
Repository-App war 0.2.0; derselbe Installationswechsel gilt auch beim direkten
Wechsel auf die aktuelle Repository-Version.

**Bereits auf der Repository-App?** Dann ist keine erneute Migration nötig.
Normale Updates aus demselben Repository werden über Home Assistant installiert;
`/data`, Bankkonfiguration und Finanzdaten bleiben erhalten. Eine neue Bankfreigabe
ist nur erforderlich, wenn sie abgelaufen ist oder ausdrücklich verlangt wird.
Die separate Rückleitungs-Integration nur aktualisieren, wenn deren Code geändert
wurde.

## Migration von einer lokalen Installation

Die bestehende lokale App bleibt installiert. Eine Repository-App hat in Home
Assistant eine eigene App-ID und ein eigenes Datenverzeichnis. Der Wechsel ist
daher kein gewöhnliches Update. Beide Installationen können parallel vorhanden
sein; der Bankabruf sollte nur in einer aktiv sein.

## A. Alten Stand sichern

1. In der bisherigen App den automatischen Bankabruf ausschalten.
2. Offene Änderungen speichern lassen und **Sicherung exportieren** wählen.
3. Zusätzlich eine Home-Assistant-Sicherung der bisherigen App anlegen.
4. Die originale PEM-Datei bereithalten. Sie ist nicht in der JSON-Sicherung.
5. Für die neue Einrichtung bereithalten: Application ID, die exakt registrierte
   HTTPS-Rücksprungadresse und die IBAN des Haushaltskontos. Diese Angaben werden
   nicht in Git gespeichert.

## B. Repository-App separat installieren

1. Das fertige Repository unter **Einstellungen → Apps → App installieren → ⋮ →
   Repositorys** hinzufügen.
2. **Haushaltsdashboard** ausdrücklich aus dem Bereich **Haushaltsdashboard Apps**
   installieren. Die bisherige Version gehört zu **Lokale Apps**.
3. Die neue App zuerst mit dem gewünschten Besitzer-Benutzer öffnen.
4. Im neuen Dashboard **Sicherung laden** wählen und die aktuelle JSON-Sicherung
   aus der bisherigen App importieren. Auf **Auf dem NUC gespeichert** warten.
5. Buchungen, Kategorien, Fixkosten, Monatswerte der beiden Einkommen und Budgets
   vergleichen. Danach die Datenübernahme in der neuen App bestätigen.
6. Die persönlichen Anzeigenamen unter **Anzeigenamen im Haushaltsdashboard**
   eintragen. Vorhandene JSON-Daten bleiben mit den bisherigen Feldnamen kompatibel.
7. Weitere HA-Benutzer in der neuen App erneut freigeben. Benutzerfreigaben werden
   bewusst nicht aus einer Finanz-JSON übernommen. Eine HA-Benutzerkennung hat
   32 hexadezimale Zeichen; zusätzliche Zeichen werden abgelehnt.

## C. Neue Bankverbindung vorbereiten

In der neuen App unter **Enable Banking verbinden** zuerst Application ID,
registrierte Rücksprungadresse und Haushaltskonto-IBAN speichern. Dann die
vorhandene PEM-Datei hinterlegen und prüfen lassen.

Der Schlüssel und die aktive Bank-Sitzung werden nicht aus dem laufenden alten
Container herauskopiert. Die Verbindung wird in der neuen App einmalig neu
eingerichtet. Die Rücksprungadresse kann gleich bleiben, sofern sie bereits
korrekt bei Enable Banking eingetragen ist.

## D. Rückleitungs-Integration umstellen

1. Die bisherige lokale App stoppen, aber nicht deinstallieren. Ihre gespeicherten
   Daten bleiben als Rückweg erhalten.
2. Den bisherigen Ordner `/config/custom_components/haushalt_bank_callback`
   sichern und durch die Integration aus diesem Repository ersetzen.
3. Home Assistant neu starten. Die aktualisierte Integration funktioniert vor
   einer Umstellung weiterhin mit der lokalen Adresse als Standard.
4. Unter **Einstellungen → Geräte & Dienste** den vorhandenen Eintrag
   **Haushaltsdashboard Bankrückleitung** öffnen. Im Menü **Neu konfigurieren**
   wählen; keinen zweiten Integrationseintrag anlegen.
5. Die interne Adresse der neuen App und ihren neuen Verbindungsschlüssel
   eintragen. Die Adresse hängt von der exakten Repository-URL ab.

Für die vorgesehene URL
`https://github.com/Thunderflash101/haushaltsdashboard-apps` ergibt sich:

```
App-ID: 03c7e9d7_haushaltsdashboard
Interne App-Adresse: http://03c7e9d7-haushaltsdashboard:8100
```

Den tatsächlichen App-Identifier in Home Assistant prüfen. Falls eine andere URL,
ein abschließendes `.git` oder ein anderer Branch eingetragen wird, kann die ID
abweichen. Die passende Adresse lässt sich aus der exakt eingetragenen URL berechnen:

```sh
python3 tools/repository_address.py https://github.com/OWNER/REPOSITORY
```

6. Die Integration prüft die interne Verbindung und registriert den Webhook der
   neuen App. Danach muss dort **Rückleitungs-Integration verbunden** erscheinen.
7. Die Bankfreigabe in der neuen App starten, das Haushaltskonto auswählen und den
   ersten Abruf prüfen. Erst nach erfolgreichem Vergleich den automatischen Abruf
   der neuen App aktiv lassen. Die alte App bleibt gestoppt.

## Rückweg

Wenn die neue Installation noch nicht funktioniert:

1. Ihre automatischen Abrufe ausschalten und die neue App stoppen.
2. Die alte lokale App wieder starten.
3. Die aktualisierte Rückleitungs-Integration über **Neu konfigurieren** auf
   `http://local-haushaltsdashboard:8100` und den Verbindungsschlüssel der alten App
   zurückstellen.
4. Bei Bedarf die Bankfreigabe in der alten App erneuern. Eine Bank kann andere
   Freigaben beim erneuten Verbinden beenden; der Fortbestand einer alten Sitzung
   ist deshalb nicht garantiert.

Während des Tests vorgenommene neue Änderungen werden nicht automatisch in die
alte App zurückgeführt. Vor dem Zurückwechseln die neue Finanz-JSON sichern und
die Unterschiede vergleichen.

## Was später ein normales Update ist

Nach erfolgreicher Umstellung bleiben Repo-URL und App-Slug stabil. Dann genügt
ein Versionsupdate aus demselben Repository; das Datenverzeichnis bleibt bestehen.
Die zusätzliche HA-Integration wird weiterhin separat aktualisiert, wenn sich
deren Code ändert.

