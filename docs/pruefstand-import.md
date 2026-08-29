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
dem **Diagramm abgelesene** Kurve. Das Ablesen aus einem Foto ist ungenau, der
gedruckte Leistungsdaten-Block dagegen nicht.

**Nur beim direkten Foto-Import** („Foto direkt auslesen…“) wird das
ausgenutzt: die abgelesene Kurve wird auf die gedruckten Spitzenwerte gezogen,
die **Form** stammt aus dem Diagramm, der **Betrag** aus dem Text – dort landet
das KI-Ergebnis ungeprüft im Dialog, eine Korrektur ist also gerechtfertigt.

**Beim CSV-Import gilt die Tabelle dagegen als maßgeblich und wird nicht
automatisch skaliert** – egal ob sie von Hand oder aus einem Export
eingetragen wurde, oder ob eine KI sie zuvor aus einem Foto befüllt hat: bis
sie hochgeladen wird, hat sie bereits einen Kontrollschritt außerhalb der App
durchlaufen (Schritt 4 oben). Weicht die Tabelle trotzdem vom gedruckten
Spitzenwert ab (meist reine Drehzahlraster-Rundung: der echte Scheitelpunkt
liegt oft zwischen zwei eingetragenen Zeilen), zeigt der Dialog das nur als
Hinweis – ab mehr als 5 % Abweichung deutlicher, damit sich ein Blick auf die
Tabelle lohnt, aber ohne die eingetragenen Werte zu verändern.

Aus denselben gedruckten Zahlenpaaren (U/min bei km/h) ergibt sich auch der
Drehzahlfaktor, ganz ohne Ablesen. Trägt man **Drehzahlfaktor** ausdrücklich ein,
hat dieser Wert Vorrang.

**Verankert wird nur die Leistung, nie die Drehzahl.** Die eingetragenen
Drehzahlen bleiben exakt so stehen, wie sie in der CSV stehen – sie werden von
einem Raster gewählt (Vorlage bzw. Prompt), nicht unabhängig von einer
Pixel-Position abgelesen, und brauchen deshalb keine Korrektur.

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

Warum 1 und 2 getrennt sind: deine Wertetabelle gilt beim Import als maßgeblich
und wird unverändert übernommen, nicht die gedruckten Werte. Die App vergleicht
nach dem Laden nur zur Kontrolle, ob deine Tabellen-Spitze zum gedruckten
Spitzenwert passt, und weist bei größerer Abweichung darauf hin – ändert die
Tabelle aber nicht. Beide Blöcke sollten deshalb möglichst genau sein: die
gedruckten Werte, weil sie unabhängig gespeichert werden und dieser Kontrolle
dienen, die Kurve, weil sie unverändert in die Auswertung übernommen wird.
```

---

Maßgeblich ist `src/lib/dragy/dynoCsv.ts` – Vorlage und Prompt stehen dort im
Code und werden von der App daraus ausgeliefert. Weicht dieses Dokument ab, gilt
der Code.
