# Dragy Analyzer

Dragy Leistungs-/Drehmomentanalyse — Build-Spezifikation

Eine reine Client-Anwendung ohne Backend, die aus Dragy-GPS-Rohdaten (oder manuell eingegebenen

Geschwindigkeits-/Zeit-Stützpunkten) Leistungs- und Drehmomentkurven mehrerer Fahrzeuge und

mehrerer Läufe berechnet und überlagert vergleichbar macht. Zielplattform: iPhone/Safari, aber

lauffähig in jedem modernen Browser.

0. Architektur-Zwang (nicht verhandelbar)

	•	Muss über eine echte http://- oder https://-Adresse geladen werden, niemals über

file://. Safari (iOS 18+) öffnet lokale HTML-Dateien aus der Dateien-App nur noch als

Quick-Look-Vorschau (kein JavaScript, kein Speicher). Zusätzlich verweigert Safari

IndexedDB/localStorage grundsätzlich für file://-Ursprünge (Sicherheitsrichtlinie seit

Safari 11). Konsequenz: Für reinen On-Device-Betrieb ohne Cloud braucht es einen lokalen

Webserver auf dem Gerät (z. B. eine “HTTP Server”-App, die den Ordner mit der Datei über

http://localhost bereitstellt) — nur so funktionieren Speicherung und “Zum Home-Bildschirm

hinzufügen”.

	•	Keine externen Netzwerkaufrufe zur Laufzeit (keine CDN-Abhängigkeiten, keine Server-API) —

die App muss offline funktionieren, sobald sie einmal geladen ist.

	•	Persistenz ausschließlich über IndexedDB (nicht localStorage — zu klein, und synchron).

	•	Einzelne, in sich geschlossene Datei (HTML mit eingebettetem CSS/JS) bevorzugt, damit sie

einfach per AirDrop/iCloud/E-Mail übertragen und über einen lokalen Server bereitgestellt

werden kann.

1. Dateneingabe

1.1 Dragy-Rohdatenimport (Primärweg)

	•	Dragy-Logs sind UBX-Binärstreams (u-blox-GPS-Protokoll). Zu parsen: NAV-PVT-Nachrichten

(Class 0x01, ID 0x07, Payload-Länge 92 Byte, Sync-Bytes 0xB5 0x62).

	•	Relevante Payload-Felder (Little Endian): iTOW (Offset 0, uint32, ms) als Zeitstempel,

hMSL (Offset 36, int32, mm) als Höhe, gSpeed (Offset 60, int32, mm/s) als

Geschwindigkeit über Grund, fixType (Offset 20, uint8) — nur Datensätze mit fixType >= 2

verwenden.

	•	Datei-Endungen: .data, .ubx. Mehrfachauswahl (mehrere Dateien gleichzeitig importieren).

	•	Eine importierte Datei = eine Session (Rohdaten-Zeitreihe + Umgebungsdaten). Eine Session

kann mehrere Minuten umfassen und mehrere Beschleunigungs-Pulls enthalten.

1.2 Manuelle Eingabe (Alternativweg für ältere/andere Datenquellen, z. B. PGear-Ausdrucke)

	•	Editierbare Tabelle: Geschwindigkeit (km/h) und zugehörige Zeit ab Laufbeginn (s) je Zeile.

	•	Beim Anlegen vorausgefüllt mit Zeilen in 10-km/h-Schritten (0 bis 200), Nutzer trägt nur die

Zeitwerte ein; leere/ungültige Zeilen werden ignoriert; Zeilen lassen sich hinzufügen/entfernen.

	•	Ergebnis wird in dieselbe interne Datenstruktur überführt wie Rohdaten-Sessions (Liste von

{t, speedKmh}), damit der gesamte weitere Verarbeitungsweg identisch bleibt.

	•	Wichtig: Bei manuellen Sessions darf die Geschwindigkeits-Glättung (siehe 3.1) nicht

angewendet werden (Fenstergröße effektiv 1) — bei nur ~19 Stützpunkten über den ganzen

Drehzahlbereich würde Glättung die ohnehin grobe Kurve zusätzlich verfälschen.

2. Datenmodell

	•	Fahrzeug (vehicle): id, name, mass (kg, inkl. Fahrer/Tank), cd, area (m²),

crr, calibrated (bool), smoothingWindow (Messpunkte), rpmFactorDefault (U/min pro

km/h), rpmMatch ({maxRpm, maxKmh} — Rohwerte für die Ableitung, siehe 2.3),

dragCurve (Liste von {rpm, ps} — Schleppleistungs-Stützpunkte vom Prüfstand).

	•	Session: id, vehicleId (gehört zu genau einem Fahrzeug), name, records

(Liste {t, speedKmh, heightM}), tempC, pressureHpa, rh (Umgebungsdaten für

Luftdichte), manual (bool), bei manuellen Sessions zusätzlich manualRows

(editierbare Rohtabelle, aus der records abgeleitet wird).

	•	Lauf/Segment (segment): id, sessionId, name, startT, endT (Sekunden

innerhalb der Session — mehrere Segmente pro Session möglich, auch überlappungsfrei

mehrere Pulls in derselben Aufzeichnung), rpmFactor, color, visible (bool, für

Ein-/Ausblenden im Vergleich ohne Löschen), calibration (optional: eigene {crr, cdA},

überschreibt den Fahrzeug-Standard nur für dieses Segment).

2.1 Mehrere Fahrzeuge

	•	Beliebig viele Fahrzeugprofile anlegbar, jederzeit wechselbar (“aktives Fahrzeug”).

	•	Sessions/Läufe gehören immer zum Fahrzeug, das beim Import aktiv war; Sessions-Liste,

Kalibrierung und Vergleichsansicht zeigen nur Daten des aktuell aktiven Fahrzeugs.

	•	Fahrzeug löschen kaskadiert auf alle zugehörigen Sessions/Läufe (mit Bestätigungsdialog,

der die Anzahl betroffener Sessions nennt).

2.2 RPM-Faktor-Ableitung aus Vmax-Angabe

	•	Statt den Faktor “U/min pro km/h” nur manuell zu schätzen: zwei Eingabefelder “höchste

erreichte Drehzahl” und “Geschwindigkeit dabei”, ein Button berechnet

rpmFactorDefault = maxRpm / maxKmh und setzt ihn als Standard für neu angelegte Läufe

dieses Fahrzeugs. Bestehende Läufe werden dabei nicht rückwirkend verändert.

3. Physikalische Berechnung

3.1 Signalverarbeitung

	•	Geschwindigkeit glätten: zentrierter gleitender Mittelwert, Fenstergröße konfigurierbar pro

Fahrzeug (Default 9 Punkte ≈ 0,9 s bei 10 Hz). Fenstergröße 1 = keine Glättung

(Pflicht für manuelle Sessions, siehe 1.2).

	•	Beschleunigung a(v): zentrale Differenz der geglätteten Geschwindigkeit (m/s) nach Zeit,

an den Rändern einseitige Differenz.

3.2 Radleistung

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://dragy-dash-charts.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6f7bbdde-47be-45f3-8451-481d43707dcb).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
