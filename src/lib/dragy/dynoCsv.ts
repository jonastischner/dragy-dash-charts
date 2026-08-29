// CSV-Weg für Prüfstandsprotokolle: Vorlage herunterladen, ausfüllen, hochladen.
//
// Die Vorlage trägt bewusst zweierlei: den gedruckten Leistungsdaten-Block und
// die aus dem Diagramm abgelesene Wertetabelle. Beim Import wird die abgelesene
// Kurve auf die gedruckten Spitzenwerte gezogen (anchorCurve in dynoExtract.ts) –
// die Form kommt aus dem Diagramm, der Betrag aus dem Text. Genau deshalb sind
// beide Teile in der Vorlage.
//
// Diese Datei ist die maßgebliche Fassung von Format und Prompt. docs/
// beschreibt dasselbe für Menschen; bei Abweichung gilt, was hier steht.

import { parseDelimited } from "./tabular";
import type { CorrectionStandard } from "./correction";
import type { DynoSheet } from "./dynoExtract";

/** Schrittweite, in der der Prompt die Drehzahlachse abarbeiten lässt. */
export const PROMPT_RPM_STEP = 250;

/**
 * Drehzahlbereich der heruntergeladenen Vorlage. Bewusst großzügig über
 * typische Serienmotoren hinaus (deckt auch hochdrehende Motorräder und
 * Rennmotoren ab) – leere Zeilen am Ende kosten beim Import nichts, sie werden
 * beim Einlesen ohnehin übersprungen (siehe parseDynoCsv). Reicht eine Kurve
 * noch weiter, lässt sich die Tabelle im Dialog per "+ Zeile" oder in der
 * Datei selbst im selben Muster fortsetzen – die Vorlage ist ein Vorschlag,
 * keine Grenze.
 */
export const TEMPLATE_RPM_MIN = 2000;
export const TEMPLATE_RPM_MAX = 14000;

function templateCurveRows(): string {
  const rows: string[] = [];
  for (let rpm = TEMPLATE_RPM_MIN; rpm <= TEMPLATE_RPM_MAX; rpm += PROMPT_RPM_STEP) {
    rows.push(`${rpm};;;`);
  }
  return rows.join("\n");
}

export const DYNO_CSV_TEMPLATE = `# Prüfstandsprotokoll – Vorlage für die Dragy Leistungsanalyse
# Zeilen mit # sind Kommentare und werden beim Import übersprungen.
# Dezimaltrenner: Komma oder Punkt, beides wird gelesen.
# Leer lassen, was nicht im Protokoll steht – nichts erfinden.
#
# Oberer Block: die im Protokoll GEDRUCKTEN Werte (Leistungsdaten/Umgebungsdaten).
# Unterer Block: die aus dem DIAGRAMM abgelesene Kurve. Die Tabelle geht bis
# ${TEMPLATE_RPM_MAX} U/min – reicht deine Kurve weiter, hänge einfach weitere
# Zeilen im selben Muster an (nächste Drehzahl, drei leere Felder). Endet die
# Kurve früher, einfach die überzähligen Zeilen leer lassen oder löschen;
# unausgefüllte Zeilen werden beim Import ohnehin ignoriert. Der Schritt von
# ${PROMPT_RPM_STEP} U/min ist ebenfalls nur ein Vorschlag – orientier dich an
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
${templateCurveRows()}
`;

export const DYNO_CSV_PROMPT = `Du bekommst ein Foto oder einen Scan eines Leistungsprüfstands-Protokolls
(z. B. MAHA LPS) und die angehängte CSV-Vorlage. Fülle die Vorlage aus und gib
NUR die fertige CSV zurück – keine Erklärung davor oder danach.

1. Der obere Block "Feld;Wert" steht als TEXT im Protokoll (Abschnitte
   "Leistungsdaten" und "Umgebungsdaten"). Übernimm diese Zahlen exakt so, wie
   sie gedruckt sind. Lies sie NICHT aus dem Diagramm ab.

2. Die untere Wertetabelle liest du dagegen aus dem DIAGRAMM ab: geh die
   Drehzahlachse in Schritten von etwa ${PROMPT_RPM_STEP} U/min durch und lies für jede Kurve
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
(${PROMPT_RPM_STEP} U/min) fast nie getroffen wird – die App ergänzt sie deshalb als
eigene, zusätzliche Zeile an genau dieser Drehzahl, statt die restliche Kurve
danach zu verbiegen. Beide Blöcke sollten deshalb möglichst genau sein: die
gedruckten Werte, weil sie so als exakte Stützpunkte einfließen, die Kurve,
weil sie unverändert in die Auswertung übernommen wird.`;

/**
 * Kopfzeile der Wertetabelle: erste Zelle nennt NUR die Drehzahl.
 *
 * Bewusst exakt und nicht per Teilstring: die Metadaten enthalten Felder wie
 * "Max. Drehzahl [U/min]" und "Drehzahlfaktor". Eine lose Suche hielte die für
 * den Tabellenkopf und würde den Rest der Datei verschlucken.
 */
const CURVE_HEADER_KEYS = ["u/min", "umin", "rpm", "drehzahl", "n"];
const isCurveHeader = (row: Array<string | number>) =>
  row.length >= 2 && CURVE_HEADER_KEYS.includes(normKey(String(row[0] ?? "")));

/**
 * Feldnamen vergleichbar machen: Einheiten in eckigen Klammern, Satzzeichen und
 * Leerraum weg. Eine von Hand oder von einem Modell leicht abgewandelte Datei
 * soll nicht am Label scheitern.
 */
function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[.*?\]/g, "")
    .replace(/[\s_.\-:]/g, "");
}

const num = (v: string | number | undefined): number | null => {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = v.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Freitext einer Korrekturnorm auf den internen Schlüssel abbilden. */
function parseStandard(raw: string): CorrectionStandard | undefined {
  const k = normKey(raw);
  if (!k) return undefined;
  if (k.includes("din")) return "din70020";
  if (k.includes("ewg") || k.includes("iso") || k.includes("801269")) return "ewg80_1269";
  if (k.includes("ohne") || k.includes("keine") || k.includes("none") || k.includes("aus")) return "none";
  return undefined;
}

/**
 * Meßdatum aus der Vorlage. Akzeptiert ISO (2024-11-28 09:36), die deutsche
 * Schreibweise (28.11.2024 9:36) und Tag-Monat-Jahr mit Bindestrich
 * (05-12-2024 / 12:30:42), wie sie z.B. niederländische Prüfstandssoftware
 * druckt. Die Uhrzeit darf durch Leerzeichen, Komma oder Schrägstrich vom
 * Datum getrennt sein; Sekunden werden akzeptiert, aber verworfen – die App
 * kennt nur Minutenauflösung.
 */
function parseMeasuredAt(raw: string): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const timeAfter = /(?:[\s,/]+(\d{1,2}):(\d{2})(?::\d{2})?)?/.source;
  const de = s.match(new RegExp(`^(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})${timeAfter}`));
  if (de) {
    const [, d, m, y, hh = "0", mm = "0"] = de;
    const p2 = (n: string) => n.padStart(2, "0");
    return `${y}-${p2(m)}-${p2(d)}T${p2(hh)}:${p2(mm)}:00`;
  }
  const iso = s.match(new RegExp(`^(\\d{4})-(\\d{2})-(\\d{2})${timeAfter}`));
  if (iso) {
    const [, y, m, d, hh = "0", mm = "0"] = iso;
    return `${y}-${m}-${d}T${hh.padStart(2, "0")}:${mm}:00`;
  }
  const dmyDash = s.match(new RegExp(`^(\\d{1,2})-(\\d{1,2})-(\\d{4})${timeAfter}`));
  if (dmyDash) {
    const [, d, m, y, hh = "0", mm = "0"] = dmyDash;
    const p2 = (n: string) => n.padStart(2, "0");
    return `${y}-${p2(m)}-${p2(d)}T${p2(hh)}:${p2(mm)}:00`;
  }
  return undefined;
}

/** Zuordnung Feldname -> Ablage im DynoSheet. */
type Assign = (sheet: DynoSheet, raw: string) => void;

const setPrinted = (key: keyof NonNullable<DynoSheet["printed"]>): Assign =>
  (sheet, raw) => {
    const n = num(raw);
    if (n == null) return;
    sheet.printed = { ...sheet.printed, [key]: n };
  };

const setEnv = (key: keyof NonNullable<DynoSheet["env"]>): Assign =>
  (sheet, raw) => {
    const n = num(raw);
    if (n == null) return;
    sheet.env = { ...sheet.env, [key]: n };
  };

const setText = (key: "bench" | "operator" | "vehicle"): Assign =>
  (sheet, raw) => { if (raw.trim()) sheet[key] = raw.trim(); };

/**
 * Bekannte Feldnamen. Der Schlüssel ist bereits normalisiert, deshalb greifen
 * auch Schreibweisen ohne Einheit oder mit anderer Zeichensetzung.
 */
const FIELDS: Record<string, Assign> = {
  fahrzeug: setText("vehicle"),
  pruefstand: setText("bench"),
  prüfstand: setText("bench"),
  pruefer: setText("operator"),
  prüfer: setText("operator"),
  messdatum: (s, raw) => { const v = parseMeasuredAt(raw); if (v) s.measuredAt = v; },
  meßdatum: (s, raw) => { const v = parseMeasuredAt(raw); if (v) s.measuredAt = v; },
  datum: (s, raw) => { const v = parseMeasuredAt(raw); if (v) s.measuredAt = v; },
  korrektur: (s, raw) => { const v = parseStandard(raw); if (v) s.correctedBy = v; },
  pnorm: setPrinted("psNorm"),
  pnormbei: setPrinted("psRpm"),
  pmot: setPrinted("psEngine"),
  prad: setPrinted("psWheel"),
  pschlepp: setPrinted("psDrag"),
  mnorm: setPrinted("nmNorm"),
  mnormbei: setPrinted("nmRpm"),
  maxdrehzahl: setPrinted("maxRpm"),
  maxdrehzahlbei: setPrinted("maxKmh"),
  tumgebung: setEnv("tempC"),
  pluft: setEnv("pressureHpa"),
  hluft: setEnv("rh"),
};

/**
 * "P_Norm bei [U/min]" und "P_Norm bei [km/h]" normalisieren beide auf
 * "pnormbei" – die Einheit steckt in der Klammer, die normKey() entfernt.
 * Deshalb wird sie hier gesondert ausgewertet.
 */
function unitOf(label: string): "rpm" | "kmh" | null {
  if (/u\s*\/\s*min|rpm/i.test(label)) return "rpm";
  if (/km\s*\/\s*h/i.test(label)) return "kmh";
  return null;
}

const BEI_FIELDS: Record<string, { rpm: keyof NonNullable<DynoSheet["printed"]>; kmh: keyof NonNullable<DynoSheet["printed"]> }> = {
  pnormbei: { rpm: "psRpm", kmh: "psKmh" },
  mnormbei: { rpm: "nmRpm", kmh: "nmKmh" },
  maxdrehzahlbei: { rpm: "maxRpm", kmh: "maxKmh" },
};

export interface DynoCsvResult {
  sheet: DynoSheet;
  /** Name des Laufs aus der Vorlage, falls angegeben. */
  name?: string;
  /** Ausdrücklich angegebener Drehzahlfaktor; sonst aus den Zahlenpaaren. */
  rpmFactor?: number;
}

/**
 * Ausgefüllte Vorlage einlesen. Ergebnis ist ein DynoSheet – dieselbe Form, die
 * auch die Foto-Auswertung liefert, damit beide Wege denselben Import teilen.
 */
export function parseDynoCsv(text: string): DynoCsvResult {
  // Kommentare VOR der Trennzeichen-Erkennung entfernen: parseDelimited() rät
  // das Trennzeichen aus der ersten Zeile, die eines enthält – ein Komma im
  // Fließtext eines Kommentars würde sonst die ganze Datei falsch zerlegen.
  const withoutComments = text
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n");
  const grid = parseDelimited(withoutComments).filter((row) => row.length > 0);

  const sheet: DynoSheet = {};
  let name: string | undefined;
  let rpmFactor: number | undefined;

  // 1) Metadaten bis zur Kopfzeile der Wertetabelle.
  let i = 0;
  for (; i < grid.length; i++) {
    const label = String(grid[i][0] ?? "").trim();
    if (!label) continue;
    if (isCurveHeader(grid[i])) break;

    const raw = String(grid[i][1] ?? "");
    const key = normKey(label);
    if (key === "feld") continue; // Kopfzeile des Metadaten-Blocks

    if (key === "name") { if (raw.trim()) name = raw.trim(); continue; }
    if (key === "drehzahlfaktor") { const n = num(raw); if (n != null && n > 0) rpmFactor = n; continue; }

    const bei = BEI_FIELDS[key];
    if (bei) {
      const n = num(raw);
      // Ohne erkennbare Einheit als Drehzahl deuten – so steht es in der Vorlage
      // an erster Stelle, und Drehzahlen sind die häufigere Angabe.
      if (n != null) sheet.printed = { ...sheet.printed, [bei[unitOf(label) === "kmh" ? "kmh" : "rpm"]]: n };
      continue;
    }
    FIELDS[key]?.(sheet, raw);
  }

  if (i >= grid.length) {
    throw new Error("Keine Kopfzeile der Wertetabelle gefunden (erwartet eine Zeile, die mit „U/min\" beginnt).");
  }

  // 2) Spalten der Wertetabelle zuordnen – Reihenfolge nicht voraussetzen.
  const header = grid[i].map((c) => String(c ?? ""));
  const findCol = (re: RegExp) => header.findIndex((h) => re.test(h));
  const cRpm = 0;
  const cWheel = findCol(/p\s*-?\s*rad/i);
  const cDrag = findCol(/schlepp/i);
  const cEngine = findCol(/p\s*-?\s*(motor|mot|norm)/i);

  const curve: NonNullable<DynoSheet["curve"]> = [];
  for (let r = i + 1; r < grid.length; r++) {
    const row = grid[r];
    const rpm = num(row[cRpm]);
    if (rpm == null || rpm <= 0) continue;
    const pWheelPs = cWheel >= 0 ? num(row[cWheel]) : null;
    const pDragPs = cDrag >= 0 ? num(row[cDrag]) : null;
    const pEnginePs = cEngine >= 0 ? num(row[cEngine]) : null;
    // Eine Zeile ohne jede Leistungsangabe ist eine unausgefüllte Vorlagenzeile.
    if (pWheelPs == null && pDragPs == null && pEnginePs == null) continue;
    curve.push({
      rpm,
      ...(pWheelPs != null ? { pWheelPs } : {}),
      ...(pDragPs != null ? { pDragPs } : {}),
      ...(pEnginePs != null ? { pEnginePs } : {}),
    });
  }

  if (curve.length === 0) {
    throw new Error("Die Wertetabelle enthält keine ausgefüllten Zeilen.");
  }
  sheet.curve = curve;
  return { sheet, name, rpmFactor };
}
