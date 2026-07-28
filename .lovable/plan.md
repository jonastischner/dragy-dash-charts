# Getriebe & Schaltdiagramme

## Ziel
- Getriebe (nur Gangübersetzungen + Reifen) und Endübersetzung als getrennte, wiederverwendbare Bausteine.
- Am Fahrzeug beliebige Kombinationen aus einem Getriebe und einer Endübersetzung anlegen ("Setup") und eines als Standard markieren.
- Pro Fahrzeug Schaltdrehzahl (Empfehlung) und Maximaldrehzahl erfassen.
- Neues Schaltdiagramm (Geschwindigkeit über Drehzahl je Gang) im Vergleich-Tab, mit Overlay-Vergleich mehrerer Setups.

## Datenmodell (src/lib/dragy/types.ts)
- Neue Typen:
  - `GearboxDef { id; name; tireSpec; gears: GearRatio[] }` — nur Gänge + Reifen.
  - `FinalDriveDef { id; name; ratio }` — reine Endübersetzung.
  - `DriveSetup { id; name; gearboxId; finalDriveId }` — Kombination am Fahrzeug.
- `Vehicle` erweitert:
  - `gearboxDefs: GearboxDef[]`, `finalDrives: FinalDriveDef[]`, `setups: DriveSetup[]`, `defaultSetupId`.
  - `shiftRpm`, `maxRpm` (beide optional).
- Migration beim Laden (VehiclesTab): bestehende `gearboxes[]` (mit finalDrive inline) einmalig in ein `GearboxDef` + eigene `FinalDriveDef` + `DriveSetup` je Eintrag aufspalten; alter Zustand bleibt lesbar. Legacy `gearbox`/`gearPresets` weiter unterstützt.

## VehiclesTab
- Neue Editor-Sektion "Antrieb":
  - Liste Getriebe (Name, Reifen, Gänge n×Ratio).
  - Liste Endübersetzungen (Name, Ratio).
  - Liste Setups: Dropdown Getriebe × Dropdown Endübersetzung, Name, "als Standard".
- Felder Schaltdrehzahl / Max-Drehzahl neben rpmFactorDefault.

## SessionsTab
- "Gemessener Gang"-Dropdown: gruppiert nach Setup-Name, Optionen zeigen den effektiven rpmFactor (aus Getriebe-Gang × Endübersetzung × Reifen). Speichert weiterhin nur `rpmFactor` (+ optional `gearPresetId` als Referenz).
- Manuelle rpmFactor-Eingabe bleibt.

## Schaltdiagramm (CompareTab)
- Neuer Modus `shiftDiagram` neben Beschleunigung/Leistung.
- Auswahl-Panel: Mehrfachauswahl von Setups (aktives Fahrzeug + optional Setups anderer eigener Fahrzeuge).
- Für jedes gewählte Setup je Gang eine Serie: x = RPM von Leerlauf-nahe bis `maxRpm`, y = km/h aus rpmFactor pro Gang. Vertikale Marker bei `shiftRpm` und `maxRpm`.
- Farbcode pro Setup, Gangnummer als Label.
- Vergleich = einfach mehrere Setups gleichzeitig aktiv; Legende toggelt einzelne Setups.

## Physik / Berechnung
- Keine Änderung an Leistungsformeln. RPM-Faktor-Auflösung zentral in einer Helper-Funktion `resolveSetupGearFactor(vehicle, setupId, gearId)`; wiederverwendet von SessionsTab und CompareTab.

## Nicht enthalten
- Automatische Erkennung des tatsächlich gefahrenen Gangs.
- Änderung der Sync-Struktur (Vehicle bleibt ein JSON-Blob, neue Felder werden automatisch mitsynchronisiert).

## Technisch
- Dateien: `src/lib/dragy/types.ts`, `src/lib/dragy/gear.ts` (Helper), `src/components/dragy/VehiclesTab.tsx`, `src/components/dragy/SessionsTab.tsx`, `src/components/dragy/CompareTab.tsx`.
- Migration inline beim Laden im VehiclesTab-State, damit keine DB-Migration nötig ist.
