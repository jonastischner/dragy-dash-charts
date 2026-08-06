# Leistungskurven in der Session + Kategorien & Module

## 1. Leistungskurven direkt in der Session-Übersicht

In der aufgeklappten Session kommt unter der Geschwindigkeitskurve ein neuer Block **"Auswertung der Läufe"**:

- Ein Sammel-Chart mit allen Läufen der Session überlagert, umschaltbar zwischen **Leistung (PS)**, **Drehmoment (Nm)** und **Beschleunigung (km/h über s)**.
- X-Achse Drehzahl bei PS/Nm, jede Kurve in der Lauffarbe, Legende zum Ein-/Ausblenden (wie im Vergleich-Tab).
- Die bestehende Peak-Tabelle (max. PS/Nm mit Drehzahl, Abweichung zum Referenzlauf) bleibt direkt darunter.
- Zusätzlich im Editor jedes Laufs eine kompakte Mini-Kurve, damit man beim Justieren von Start/Ende und Drehzahlfaktor sofort sieht, was passiert.
- Auswahl des Diagrammtyps wird pro Nutzer gespeichert (wie andere Einstellungen).

## 2. Kategorien für Läufe

Jeder Lauf bekommt eine Kategorie, die steuert, was ausgewertet und angezeigt wird:

| Kategorie | Auswertung |
| --- | --- |
| Leistungsmessung (z.B. 60–200) | Leistung/Drehmoment über Drehzahl, Peaks, Referenzvergleich |
| Beschleunigung (0–100, 100–200, 1/4 Meile) | Zeit für definierte Abschnitte, km/h über s, Distanz; keine Leistungskurve |
| Coastdown / Ausrollen | Kalibrierung (cW·A, Rollwiderstand) |
| Rallye-Stage (später) | Speed/Zeit über Distanz, Stage-Zeit |
| Rundstreckenrunde (später) | Rundenzeit, Speed-Trace |

- Neue Läufe erben die Kategorie aus dem Session-Typ, sind aber einzeln umstellbar.
- Bestehende Läufe gelten automatisch als "Leistungsmessung", damit nichts kaputt geht.
- Für Beschleunigungsläufe gibt es eine eigene Ergebniszeile: Split-Zeiten (0–100, 100–200, 60–130, 1/4 Meile) statt PS/Nm.

## 3. Module in der Navigation — Empfehlung

Ja, sinnvoll, aber **nicht als weitere Tabs**. Vorschlag: ein **Modul-Umschalter oben im Header** (Leistung & Beschleunigung / Rallye & Rundstrecke), der filtert, welche Sessions und welche Auswertungen sichtbar sind. Die Tabs (Fahrzeuge, Sessions, Vergleich, Import …) bleiben identisch, ihr Inhalt passt sich dem Modul an.

Grund: die Grunddaten (Fahrzeug, GPS-Records, Läufe) sind in allen Modulen dieselben. Zwei parallele Tab-Sets würden Fahrzeugverwaltung, Import und Backup doppeln. Der Umschalter hält die App schlank und lässt Rallye/Rundstrecke später einfach andocken.

In diesem Schritt wird das Modul-Konzept angelegt: Session-Typ am Datenmodell, Umschalter im Header, Rallye/Rundstrecke sichtbar als "in Vorbereitung", ohne fertige Auswertung.

## Technische Details

- `src/lib/dragy/types.ts`: `Segment.category` (`"power" | "accel" | "coastdown" | "stage" | "lap"`), `Session.kind` (`"performance" | "rally" | "circuit"`), beide optional mit Default `power`/`performance` für Altdaten.
- `src/lib/dragy/physics.ts`: Hilfsfunktion für Split-Zeiten (Zeit zwischen zwei Geschwindigkeiten, 1/4-Meile via Distanzintegration der Speed-Kurve).
- `src/components/dragy/SessionsTab.tsx`: neue Unterkomponente `SessionCurves` (Chart + Modusumschalter), Kategorie-Select im `SegmentEditor`, Mini-Chart pro Lauf, kategorieabhängige Peak-/Split-Tabelle.
- `src/routes/index.tsx`: Modul-Umschalter im Header, aktives Modul in `localStorage`, Filterung der Sessions nach `kind`.
- Bestehende `Chart`-Komponente wird wiederverwendet, keine neue Chart-Library.
