# Getriebe-Simulator als eigenes Modul

Der Schaltdiagramm-Vergleich verlässt die Garage. Die Garage wird auf „was ist verbaut / was liegt im Lager“ reduziert, alle „was wäre wenn“-Spielereien bekommen ein eigenes Modul auf der Startseite.

## 1. Garage aufräumen

- Der Block „Schaltdiagramm (Setups vergleichen)“ wird aus dem Fahrzeugdialog entfernt.
- Der Antrieb-Bereich wird neu sortiert:
  - **Aktuelles Setup** (oben, offen): Auswahl des verbauten Setups mit Kurz-Zusammenfassung (Getriebe, Endübersetzung, Reifen, rpm/kmh je Gang). Ersetzt das bisherige „als Standard“-Gefummel.
  - **Setup-Varianten** (offen): benannte weitere Setups (z.B. „Rallye Kurzstrecke“), jede mit „als aktuell setzen“.
  - **Lager** (zugeklappt): Getriebe, Endübersetzungen, Reifen – unverändert pflegbar, nur weniger prominent.
- Statt eines Diagramms steht am Ende des Antrieb-Bereichs ein Hinweis mit Link: „Setups vergleichen im Getriebe-Simulator“.

## 2. Neues Modul „Getriebe-Simulator“

Als 5. Kachel auf der Startseite (Icon: Zahnrad/Settings2), unterhalb bzw. neben den vier Mess-Modulen, mit Untertitel „Setups vergleichen, ohne das Fahrzeug zu ändern“. Öffnet eine eigene Seite mit Zurück-Button, gleicher Rahmen wie die Mess-Module.

Inhalte (drei Tabs im gleichen Tab-Stil wie die Modul-Ansichten):

**Schaltdiagramm** – das bekannte Sägezahn-Diagramm (km/h auf X, U/min auf Y, senkrechte Schaltsprünge, waagerechte Schalt-/Maximaldrehzahl-Linien), jetzt in voller Seitenbreite und höher. Setup-Auswahl per Checkboxen, Auswahl wird pro Fahrzeug gespeichert.

**Tempo-/Drehzahl-Tabelle** – pro aktivem Setup eine Tabelle: Gang, Übersetzung, rpm/kmh, km/h bei Schaltdrehzahl, km/h bei Maximaldrehzahl, Drehzahl nach dem Schalten in den nächsten Gang.

**Beschleunigungs-Prognose** – aus der besten gemessenen Leistungskurve des Fahrzeugs (Leistungs-Modul) wird für jedes aktive Setup eine Beschleunigung simuliert: Zeit über km/h plus Kennzahlen 0–100, 0–200 und 100–200 km/h, jeweils mit Delta zum aktuellen Setup als Referenz. Fehlt eine Messung, erscheint ein Hinweis mit Verweis auf das Leistungs-Modul.

**Was-wäre-wenn:** zusätzlich zu den gespeicherten Setups gibt es im Simulator ein temporäres „Testsetup“ (Getriebe × Endübersetzung × Reifen frei wählbar, Endübersetzung auch als freier Zahlenwert). Es wirkt nur in der Simulation, ändert das Fahrzeug nicht, und kann optional per Button als echte Setup-Variante in die Garage übernommen werden.

## Technische Umsetzung

- `src/lib/dragy/types.ts`: `Vehicle.defaultSetupId` bleibt der Träger des „aktuellen Setups“ (keine Migration nötig); Setup-Varianten sind einfach die restlichen Einträge in `setups`.
- Neues Verzeichnis `src/components/dragy/sim/`:
  - `GearSimWorkspace.tsx` – Seitenrahmen + Tab-Umschaltung (`usePersistedState`), Setup-Auswahl, Testsetup-State.
  - `ShiftDiagram.tsx` – Diagramm-Logik, verschoben aus `VehiclesTab.tsx` (`ShiftDiagramCompare`) und auf eine Liste „effektiver Setups“ (inkl. Testsetup) umgestellt.
  - `GearSpeedTable.tsx` – Tabelle.
  - `AccelForecast.tsx` – Prognose.
- `src/lib/dragy/gearSim.ts`: reine Rechenhilfen – Gänge eines (auch virtuellen) Setups auflösen, Sägezahn-Punkte erzeugen, Tempo-Tabelle bauen, Beschleunigung integrieren (Rad-Leistung aus gemessener Kurve − Luft-/Rollwiderstand, Schaltpausen als konstante Zeit) auf Basis der vorhandenen Helfer in `physics.ts` und `gear.ts`.
- `src/components/dragy/HomeTab.tsx`: fünfte Kachel „Getriebe-Simulator“, die kein `ModuleId` ist, sondern über einen separaten Callback die Simulator-Seite öffnet (Modul-Kacheln der Mess-Module bleiben unverändert).
- `src/routes/index.tsx`: neuer State `openSim`, rendert `GearSimWorkspace` im Start-Tab; Wechsel auf andere Tabs schließt ihn (wie `openModule`).
- `src/components/dragy/VehiclesTab.tsx`: `ShiftDiagramCompare` und der zugehörige Chart-Import entfallen, Antrieb-Bereich in „Aktuelles Setup / Varianten / Lager“ umgegliedert.
