# PDF-Export im Maha-Protokollstil

Ziel: Aus einem Leistungs-Lauf ein einseitiges PDF im Layout deiner MTO/Maha-Vorlage erzeugen — Diagramm oben, darunter die Datenblöcke. Alles rein clientseitig (offline, funktioniert auch in der iOS-App).

## Aufbau der PDF-Seite (A4 quer)

```text
Meßdatum: 02.10.2025 (10:18)          Fahrzeug / Session
+--------------------------------------------------------------+
| 500 |  Legende: P-Rad [PS] blau                        | 500 |
|     |           P-Schlepp [PS] grün                    |     |
| 400 |           P-Motor [PS] rot                       | 400 |
|     |           M-Motor [Nm] rot                       |     |
| ... |   Gitternetz + Kurven                            | ... |
|   0 +----------------------------------------------+   |   0 |
|     0   1000  2000 ... 9000            n [U/min]         Nm  |
+--------------------------------------------------------------+
| Leistungsdaten            | Umgebungsdaten                   |
|  P_Mot   319,3 PS/234,9kW |  Temperatur, Luftdruck, Feuchte  |
|  P_Rad   252,9 PS/186,0kW |                                  |
|  P_Schl   66,5 PS/ 48,9kW |----------------------------------|
|  Max. Leistung bei U/min, km/h | Fahrzeugdaten               |
|  M_Mot   277,2 Nm @ U/min      |  Masse, Cd·A, Crr, Setup,   |
|  Max. erreichte Drehzahl       |  rpm/km-h-Faktor, Glättung  |
+--------------------------------------------------------------+
Fußzeile: Fahrzeug-Typ, Kennzeichen, Prüfer, Notizen
```

Linke Y-Achse: PS. Rechte Y-Achse: Nm. X-Achse: Drehzahl. Achsen-Maxima werden auf runde Werte (100er PS / 1000er U/min) aufgerundet, das Gitternetz wie in der Vorlage feinmaschig mit betonten Hauptlinien.

## Kurven im Diagramm

- **P-Rad (blau)** — Radleistung aus `pWheelW`
- **P-Schlepp (grün)** — Schleppleistung aus `pDragW` (Schleppkurve des Fahrzeugs)
- **P-Motor (rot)** — Rad + Schlepp aus `pEngineW`
- **M-Motor (rot)** — Motordrehmoment aus `torqueEngineNm`, skaliert auf die rechte Achse

Hinweis: Maha nennt die korrigierte Kurve „P-Norm (EWG 80/1269)". Ich beschrifte unsere Kurve als „P-Motor" und weise in einer Fußnote aus, dass keine Normkorrektur angewandt wird — sonst würden wir einen Prüfstandswert vortäuschen, den GPS-Daten nicht liefern.

## Bedienung in der App

- Im Modul „Leistung" → Lauf-Editor: Button **„PDF-Protokoll"** pro Lauf.
- Im Vergleich-Tab: **„PDF exportieren"** — erzeugt für jeden sichtbaren Lauf ein Blatt in einem Dokument (Mehrseiten-PDF), damit Vorher/Nachher direkt vergleichbar ist.
- Vorher ein kleiner Dialog für die Kopf-/Fußdaten, die die App nicht kennt: Kennzeichen, Prüfer, Fahrzeug-Typ, Kundenname. Eingaben werden pro Fahrzeug in `localStorage` gemerkt.
- Ausgabe: Download der Datei bzw. Teilen-Dialog auf iOS.

## Technische Umsetzung

- Neue Datei `src/lib/dragy/mahaPdf.ts`: Peak-Ermittlung (PS/Nm samt Drehzahl und km/h), Achsen-Skalierung, Zeichnen von Gitter, Achsen, Legende, Kurven und der Tabellenblöcke.
- `jspdf` als Abhängigkeit (Vektor-PDF, kein Server nötig, kein Canvas-Screenshot → scharfer Druck).
- Datenquelle ist unverändert `computeSegment()` aus `physics.ts`; keine Änderung an der Physik.
- Neue Komponente `src/components/dragy/PdfExportDialog.tsx` für die Kopfdatenfelder, eingebunden in `RunsList.tsx` (pro Lauf) und `CompareTab.tsx` (alle sichtbaren Läufe).
- Farben im PDF entsprechen der Vorlage (Print-Farben, unabhängig vom App-Theme).

## Qualitätssicherung

Ich rendere ein Beispiel-PDF aus Testdaten, wandle es in ein Bild und prüfe Achsen, Gitter, Kurvenverlauf, Textabstände und Zahlenformate (deutsches Komma) vor der Abgabe.
