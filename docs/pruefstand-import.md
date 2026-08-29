# Prüfstandsprotokolle importieren

Gemessene Leistungsdiagramme (MAHA LPS und Ähnliche) kommen über eine CSV-Vorlage
in die App. Kein Prüfstands-Export nötig, kein Serverdienst, kein API-Schlüssel –
es reicht ein Foto des Protokolls.

## In vier Schritten

1. In der App: **Leistung & Drehmoment → Aufnehmen → Prüfstandsprotokoll… →
   CSV-Vorlage herunterladen**.
2. In Claude (oder einem anderen Modell mit Bildverständnis) ein **Foto des
   Protokolls** und die **Vorlage** anhängen und den [Prompt](#prompt) einfügen.
3. Die zurückgegebene CSV speichern und in der App über **Ausgefüllte CSV laden…**
   öffnen.
4. Die Werte im Dialog **gegen das Protokoll prüfen**, dann speichern. Der Lauf
   erscheint danach wie ein GPS-Lauf in Diagrammen, Spitzenwerten, Vergleich und
   PDF-Export.

Schritt 2 lässt sich auch überspringen: die Wertetabelle kann man im Dialog
direkt eintippen.

## Warum die Vorlage zweigeteilt ist

Der obere Block sind die im Protokoll **gedruckten** Zahlen, der untere die aus
dem **Diagramm abgelesene bzw. eingetragene** Kurve. Die gedruckten
Spitzenwerte (P_Norm, M_Norm) sind bereits normkorrigiert – exakt dieselbe
Größe wie die Kurve selbst, kein unabhängiger, "genauerer" Wert. Die Kurve
deswegen zu skalieren wäre falsch: es würde jeden eingetragenen Wert
verändern, nicht nur die Spitze.

Der eigentliche Grund, warum die Tabellen-Spitze selten exakt den gedruckten
Wert trifft: das Protokoll nennt die Spitze an ihrer **exakten** Drehzahl
(z. B. 8320 U/min), während die Tabelle nur ein festes Raster abdeckt
(z. B. alle 250 U/min: …, 8250, 8500, …) – die Spitze liegt fast immer
zwischen zwei eingetragenen Zeilen und fehlt der Kurve deshalb schlicht als
Stützpunkt. Kein Ablesefehler, keine Ungenauigkeit.

**Der Import ergänzt deshalb die gedruckten Spitzenwerte als eigene,
zusätzliche Zeilen an ihrer exakten Drehzahl** – aus P_Norm direkt, aus
M_Norm über M = 7023,8·PS/n in eine Leistung umgerechnet. Alle anderen Werte
bleiben exakt so stehen, wie sie eingetragen bzw. abgelesen wurden; nichts
wird skaliert oder verschoben. Das gilt gleichermaßen für CSV/Handeingabe und
für den direkten Foto-Import.

Aus denselben gedruckten Zahlenpaaren (U/min bei km/h) ergibt sich auch der
Drehzahlfaktor, ganz ohne Ablesen. Trägt man **Drehzahlfaktor** ausdrücklich ein,
hat dieser Wert Vorrang.

## Format

- Trennzeichen `;`, `,` oder Tab – wird automatisch erkannt
- Dezimaltrenner Komma oder Punkt
- Zeilen mit `#` sind Kommentare
- Feldnamen werden tolerant verglichen; Einheiten in eckigen Klammern dürfen fehlen
- **P-Motor** darf leer bleiben, wenn P-Rad und P-Schlepp da sind – die Summe wird gebildet
- Meßdatum als `28.11.2024 9:36` oder `2024-11-28 09:36`
- Leere Zeilen der Wertetabelle werden übersprungen
- Die Vorlage deckt 2000–14000 U/min in 250er-Schritten ab –
  reicht eine Kurve weiter, einfach im selben Muster weitere Zeilen anhängen
  (in der Datei oder im Dialog über „+ Zeile"). Das ist ein Vorschlag, keine Grenze.

```csv
# Prüfstandsprotokoll – Vorlage für die Dragy Leistungsanalyse
# Zeilen mit # sind Kommentare und werden beim Import übersprungen.
# Dezimaltrenner: Komma oder Punkt, beides wird gelesen.
# Leer lassen, was nicht im Protokoll steht – nichts erfinden.
#
# Oberer Block: die im Protokoll GEDRUCKTEN Werte (Leistungsdaten/Umgebungsdaten).
# Unterer Block: die aus dem DIAGRAMM abgelesene Kurve. Die Tabelle geht bis
# 14000 U/min – reicht deine Kurve weiter, hänge einfach weitere
# Zeilen im selben Muster an (nächste Drehzahl, drei leere Felder). Endet die
# Kurve früher, einfach die überzähligen Zeilen leer lassen oder löschen;
# unausgefüllte Zeilen werden beim Import ohnehin ignoriert. Der Schritt von
# 250 U/min ist ebenfalls nur ein Vorschlag – orientier dich an
# den Rasterlinien des Diagramms, wenn die gröber oder feiner sind.

Feld;Wert
Name;Prüfstandslauf
Fahrzeug;
Prüfstand;
Prüfer;
Meßdatum;
Korrektur;DIN 70020
Drehzahlfaktor;
P_Norm [PS];
P_Norm bei [U/min];
P_Norm bei [km/h];
P_Mot [PS];
P_Rad [PS];
P_Schlepp [PS];
M_Norm [Nm];
M_Norm bei [U/min];
M_Norm bei [km/h];
Max. Drehzahl [U/min];
Max. Drehzahl bei [km/h];
T_Umgebung [°C];
p_Luft [hPa];
H_Luft [%];

U/min;P-Rad [PS];P-Schlepp [PS];P-Motor [PS]
2000;;;
2250;;;
2500;;;
2750;;;
3000;;;
3250;;;
3500;;;
3750;;;
4000;;;
4250;;;
4500;;;
4750;;;
5000;;;
5250;;;
5500;;;
5750;;;
6000;;;
6250;;;
6500;;;
6750;;;
7000;;;
7250;;;
7500;;;
7750;;;
8000;;;
8250;;;
8500;;;
8750;;;
9000;;;
9250;;;
9500;;;
9750;;;
10000;;;
10250;;;
10500;;;
10750;;;
11000;;;
11250;;;
11500;;;
11750;;;
12000;;;
12250;;;
12500;;;
12750;;;
13000;;;
13250;;;
13500;;;
13750;;;
14000;;;
```

## Prompt

```text
Du bekommst ein Foto oder einen Scan eines Leistungsprüfstands-Protokolls
(z. B. MAHA LPS) und die angehängte CSV-Vorlage. Fülle die Vorlage aus und gib
NUR die fertige CSV zurück – keine Erklärung davor oder danach.

1. Der obere Block "Feld;Wert" steht als TEXT im Protokoll (Abschnitte
   "Leistungsdaten" und "Umgebungsdaten"). Übernimm diese Zahlen exakt so, wie
   sie gedruckt sind. Lies sie NICHT aus dem Diagramm ab.

2. Die untere Wertetabelle liest du dagegen aus dem DIAGRAMM ab: geh die
   Drehzahlachse in Schritten von etwa 250 U/min durch und lies für jede Kurve
   den Wert an der Leistungsachse ab – orientiere dich an den Rasterlinien des
   Diagramms, wenn die gröber oder feiner sind, Hauptsache gleichmäßig. Üblich
   sind drei Kurven: P-Rad, P-Schlepp und P-Norm bzw. P-Motor. Zeilen außerhalb
   des gezeichneten Bereichs löschst du. Reicht die Kurve über die letzte Zeile
   der Vorlage hinaus (z. B. bei hochdrehenden Motoren), hänge weitere Zeilen im
   selben Muster an statt sie wegzulassen – die Vorlage ist nur ein Vorschlag,
   keine Grenze.

3. Was du nicht sicher erkennst, lässt du leer. Nichts raten, nichts
   interpolieren, keine Werte erfinden.

4. Feldnamen und das Semikolon als Trennzeichen nicht verändern. Die #-Zeilen
   bleiben unverändert stehen.

Warum 1 und 2 getrennt sind: deine Wertetabelle wird unverändert übernommen,
nichts wird skaliert oder verschoben. Die gedruckten Spitzenwerte (P_Norm,
M_Norm) nennen aber ihre EXAKTE Drehzahl, die auf deinem festen Raster
(250 U/min) fast nie getroffen wird – die App ergänzt sie deshalb als
eigene, zusätzliche Zeile an genau dieser Drehzahl, statt die restliche Kurve
danach zu verbiegen. Beide Blöcke sollten deshalb möglichst genau sein: die
gedruckten Werte, weil sie so als exakte Stützpunkte einfließen, die Kurve,
weil sie unverändert in die Auswertung übernommen wird.
```

---

Maßgeblich ist `src/lib/dragy/dynoCsv.ts` – Vorlage und Prompt stehen dort im
Code und werden von der App daraus ausgeliefert. Weicht dieses Dokument ab, gilt
der Code.
