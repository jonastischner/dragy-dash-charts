# Umbau: Module als Rückgrat der App

Heute liegt alles in einer flachen Tab-Reihe (Fahrzeuge, Sessions, Vergleich, Import, Live, Kalibrierung, Backup, Konto), und der Modul-Umschalter filtert nur die Session-Liste. Läufe tragen zusätzlich eine eigene Kategorie – doppelte Typisierung, die sich widersprechen kann.

Neu: Das Modul ist die oberste Ordnungsebene. Eine Aufnahme gehört zu genau einem Modul, alle Läufe darin erben diesen Typ, und jedes Modul bringt seine eigene Auswertung mit.

## Neue Struktur

Das Fahrzeug steht über allen Modulen: Es wird einmal global gewählt (persistente Fahrzeug-Auswahl in der Kopfzeile, in jedem Tab sichtbar und umschaltbar) und gilt dann für alle Module gleichzeitig. Ein Modulwechsel ändert das Fahrzeug nie, ein Fahrzeugwechsel behält das aktive Modul.

```text
Fahrzeug (global gewählt, gilt über alle Module)
  ├── Stammdaten: Antriebsstrang, Getriebe, Reifen, Setups, Widerstands-Standardwerte
  └── Module: Leistung | Beschleunigung | Rallye-Stage | Rundstrecke
        └── Aufnahme (Datei-Import oder Live-Fahrt, gehört zu genau einem Modul)
              └── Läufe (Zuschnitt, erben das Modul der Aufnahme)
```

Coastdown ist kein Modul und kein Tab mehr: Das Fahrzeug hat Standardwerte für Rollwiderstand und Luftwiderstand, und jeder Lauf kann diese optional überschreiben – inklusive Auto-Erkennung direkt im Lauf.

## Navigation

Vier Tabs statt acht, plus eine globale Fahrzeug-Auswahl in der Kopfzeile:

| Tab | Inhalt |
| --- | --- |
| Start | Modul-Kacheln mit den Bestwerten des gewählten Fahrzeugs; Einstieg in ein Modul |
| Aufnehmen | Import (UBX/Excel/manuell) und Live-BLE zusammengelegt, mit Modul-Auswahl |
| Garage | Fahrzeuge verwalten, Antriebsstrang, Getriebe, Endübersetzungen, Reifen, Setups, Schaltdiagramme, Widerstands-Standardwerte |
| Mehr | Backup, Konto/Sync, Grenzen & Annahmen |

Start zeigt pro Modul eine Kachel mit dem jeweiligen Rekord des Fahrzeugs (z.B. „312 PS bei 5.900 /min" bzw. „0–100 in 4,8 s"). Ein Tap öffnet den Modul-Arbeitsbereich mit drei Bereichen: Aufnahmen & Läufe, Auswertung, Vergleich – alles ausschließlich innerhalb dieses Moduls, aber immer für das global gewählte Fahrzeug.



## Auswertung je Modul

- **Leistung**: Leistungs-/Drehmomentkurven über Drehzahl, Peak-Tabelle, referenzbasierte Abweichungen (absolut und in Prozent), Coastdown-Werte pro Lauf.
- **Beschleunigung**: Split-Zeiten (0–100, 100–200, 60–130, 80–120), 1/4 Meile mit Trap-Speed, Distanz, km/h-über-Zeit-Kurve. Keine Drehzahl- und Leistungsspalten.
- **Rallye-Stage / Rundstrecke**: Stage- bzw. Rundenzeit, Geschwindigkeit über Distanz, Höhenprofil, Vergleich mehrerer Durchgänge. Startumfang: Zeit, Distanz, Speed-Trace; Sektor- und Bestsektor-Logik als späterer Ausbau.

Der Vergleich wird pro Modul zugeschnitten: Läufe aus verschiedenen Aufnahmen desselben Moduls (auch fahrzeugübergreifend) lassen sich überlagern, aber niemals ein Leistungslauf gegen eine Rundstreckenrunde.

## Migration bestehender Daten

Automatisch beim Laden, ohne Nutzeraktion:
- Aufnahme ohne Modul → „Leistung".
- Enthielt eine Aufnahme bisher überwiegend Beschleunigungsläufe, wandert sie nach „Beschleunigung".
- Bisherige Coastdown-Läufe behalten ihre Widerstandswerte, jetzt als Lauf-Überschreibung.
- Nichts wird gelöscht; Namen, Notizen, Farben, Gewicht-Overrides, Getriebe-Zuordnung und Referenz-Markierungen bleiben erhalten.

## Technische Umsetzung

- `src/lib/dragy/types.ts`: `Session.module: Module` (`power | accel | rally | circuit`) ersetzt `kind`; `Segment.category` entfällt; `Segment.calibration` bleibt als optionale Coastdown-Überschreibung.
- `src/lib/dragy/modules.ts` (ersetzt `categories.ts`): Modul-Metadaten – Label, Icon, Standard-Diagramm, welche Kennzahlen und Tabellenspalten gelten, Rekord-Berechnung für die Start-Kacheln.
- `src/lib/dragy/store.ts`: Migration beim Laden, `activeModule` als persistierter Zustand, Selektoren `sessionsFor(vehicle, module)` und `runsFor(vehicle, module)`.
- `src/lib/dragy/physics.ts`: bleibt inhaltlich; Coastdown-Auflösung wird zentral zu „Lauf-Override, sonst Fahrzeug-Standard".
- Neue Komponenten: `HomeTab.tsx` (Modul-Kacheln), `ModuleWorkspace.tsx` (Rahmen mit den drei Bereichen), `RunsList.tsx`, `analysis/PowerAnalysis.tsx`, `analysis/AccelAnalysis.tsx`, `analysis/TrackAnalysis.tsx`, `CaptureTab.tsx` (Import + Live), `MoreTab.tsx`.
- `SessionsTab.tsx` wird in `RunsList` + die drei Analyse-Komponenten aufgeteilt; `CalibrationTab.tsx` löst sich in Fahrzeug-Standardwerte und einen Coastdown-Block im Lauf-Editor auf; `CompareTab.tsx` wird modul-parametrisiert.
- `src/routes/index.tsx`: vier Tabs, Modul-Zustand im Router-freien lokalen State + localStorage; Cloud-Sync und IndexedDB-Schema bleiben unverändert (nur ein zusätzliches Feld im JSONB).

## Was gleich bleibt

Offline-Fähigkeit, IndexedDB, Backup/Restore, Cloud-Sync mit Konto, Physik und Glättung, Fahrzeug-/Antriebsstrang-Verwaltung, Schaltdiagramm-Vergleich, Capacitor-Build für iOS.
