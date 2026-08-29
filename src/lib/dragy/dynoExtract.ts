// Aus einer Protokoll-Extraktion einen DynoRun machen.
//
// Der Kern des Problems: der gedruckte Leistungsdaten-Block ist zuverlässig
// lesbar, der Kurvenverlauf aus einer Rastergrafik dagegen nicht. Ein
// Prüfstandsprotokoll ist aber redundant – es nennt die Spitzenwerte im Text
// UND zeichnet sie. Diese Redundanz wird hier ausgenutzt: die FORM stammt aus
// dem Diagramm, der BETRAG aus dem gedruckten Text.

import { NM_PER_PS_RPM } from "./physics";
import type { CorrectionStandard } from "./correction";
import type { DynoPoint, DynoRun } from "./types";

/** Rohergebnis der Edge Function extract-dyno-sheet. */
export interface DynoSheet {
  bench?: string;
  operator?: string;
  vehicle?: string;
  measuredAt?: string;
  correctedBy?: CorrectionStandard;
  printed?: {
    psNorm?: number; psEngine?: number; psWheel?: number; psDrag?: number;
    psRpm?: number; psKmh?: number;
    nmNorm?: number; nmRpm?: number; nmKmh?: number;
    maxRpm?: number; maxKmh?: number;
  };
  env?: { tempC?: number; pressureHpa?: number; rh?: number };
  curve?: Array<{ rpm?: number; pWheelPs?: number; pDragPs?: number; pEnginePs?: number }>;
}

const fin = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Drehzahlfaktor aus den gedruckten Zahlenpaaren (U/min bei km/h). Das
 * Protokoll nennt drei davon; gemittelt sind sie deutlich belastbarer als
 * alles, was sich aus dem Diagramm ablesen ließe.
 */
export function rpmFactorFromSheet(printed: DynoSheet["printed"]): number | null {
  if (!printed) return null;
  const pairs: Array<[number | null, number | null]> = [
    [fin(printed.psRpm), fin(printed.psKmh)],
    [fin(printed.nmRpm), fin(printed.nmKmh)],
    [fin(printed.maxRpm), fin(printed.maxKmh)],
  ];
  const factors = pairs
    .filter(([rpm, kmh]) => rpm != null && kmh != null && rpm > 0 && kmh > 0)
    .map(([rpm, kmh]) => (rpm as number) / (kmh as number));
  if (factors.length === 0) return null;
  return factors.reduce((s, f) => s + f, 0) / factors.length;
}

export interface AnchorInfo {
  /** Rechnerischer Faktor zwischen abgelesener/eingetragener und gedruckter Spitzenleistung. */
  scale: number;
  /**
   * Wurde der Faktor tatsächlich auf die Kurve angewendet? Nur beim Auslesen
   * eines Fotos/Scans (source "vision") – dort ist die Kurve selbst eine
   * Schätzung (Pixel-Position auf einer Rastergrafik), der gedruckte Text
   * dagegen zuverlässig, eine Korrektur also gerechtfertigt.
   *
   * Bei CSV/Handeingabe (source "manual") ist es umgekehrt: die Tabelle IST
   * die Messung, vom Nutzer bzw. seiner eigenen Prüfstandssoftware exakt
   * angegeben. Der gedruckte Spitzenwert ist dort nur ein zusätzlicher
   * Beleg, kein zuverlässigerer Wert als die Tabelle selbst – eine Abweichung
   * ist meist reine Drehzahlraster-Rundung (der wahre Scheitel der Kurve
   * liegt zwischen zwei eingetragenen Zeilen). Die eingetragenen Werte
   * bleiben in diesem Fall unangetastet, `scale`/`suspicious` dienen nur der
   * Anzeige als Cross-Check.
   */
  applied: boolean;
  /** Spitzenleistung der Kurve vor der Verankerung (Tabelle bzw. Ablesung). */
  readPs: number | null;
  /** Gedruckte Spitzenleistung, an der verankert bzw. gegengeprüft wurde. */
  printedPs: number | null;
  /** Welches gedruckte Feld das war – für die Anzeige im Dialog. */
  printedField: "P_Norm" | "P_Mot" | null;
  /** Auffällig große Abweichung – dann lohnt ein Blick auf Tabelle vs. Protokoll. */
  suspicious: boolean;
}

/** Ab dieser Abweichung gilt der Unterschied als auffällig. */
export const ANCHOR_WARN = 0.05;

/**
 * Kurve an den gedruckten Eckwerten verankern – aber nur, wenn `applyScale`
 * gesetzt ist. Ohne gedruckte Werte oder ohne `applyScale` bleibt die Kurve
 * unverändert; `scale`/`suspicious` werden trotzdem berechnet, damit der
 * Dialog eine Abweichung anzeigen kann, ohne die Werte selbst zu verändern.
 *
 * Verankert wird NUR die Leistung, nicht die Drehzahl. Die Drehzahl je Zeile
 * wird beim Ausfüllen von einem Raster gewählt (Vorlage bzw. Prompt: "in
 * Schritten von etwa 250 U/min") und nicht unabhängig von einer Pixel-Position
 * abgelesen – anders als die Leistung gibt es also keinen Ablesefehler, der
 * eine Korrektur rechtfertigt. Eine frühere Fassung verschob zusätzlich die
 * gesamte Drehzahlachse, damit der Spitzenwert exakt auf die gedruckte
 * Drehzahl fällt – das ließ eingetragene runde Drehzahlen (2000, 2250, …) im
 * Dialog krumm erscheinen (2015, 2265, …) und wurde deshalb entfernt.
 */
export function anchorCurve(
  points: DynoPoint[],
  printed: DynoSheet["printed"],
  applyScale: boolean,
): { points: DynoPoint[]; anchor: AnchorInfo } {
  const none: AnchorInfo = { scale: 1, applied: false, readPs: null, printedPs: null, printedField: null, suspicious: false };
  if (points.length === 0) return { points, anchor: none };

  let peak = points[0];
  for (const p of points) if (p.pEnginePs > peak.pEnginePs) peak = p;

  // P_Norm (bereits normkorrigiert) und P_Mot (roh, vor der Korrektur) sind
  // zwei unterschiedliche physikalische Größen, keine genauere/ungenauere
  // Fassung derselben Zahl – ihr Verhältnis IST der Korrekturfaktor, oft
  // mehrere Prozent. Je nach Prüfstandssoftware zeigt das Diagramm (und damit
  // die eingetragene bzw. abgelesene Kurve) mal die eine, mal die andere.
  // Verankert bzw. verglichen wird deshalb mit dem Feld, dem die Kurve
  // tatsächlich näher kommt – sonst würde die normale Normkorrektur selbst
  // fälschlich als Ablesefehler oder Rundungsdifferenz interpretiert.
  const candidates: number[] = [];
  const psNorm = fin(printed?.psNorm);
  const psEngine = fin(printed?.psEngine);
  if (psNorm != null && psNorm > 0) candidates.push(psNorm);
  if (psEngine != null && psEngine > 0) candidates.push(psEngine);

  if (candidates.length === 0 || peak.pEnginePs <= 0) {
    return { points, anchor: { ...none, readPs: peak.pEnginePs, printedPs: psNorm ?? psEngine ?? null } };
  }

  const printedPs = candidates.reduce((best, c) =>
    Math.abs(c - peak.pEnginePs) < Math.abs(best - peak.pEnginePs) ? c : best);
  const printedField: "P_Norm" | "P_Mot" = printedPs === psNorm ? "P_Norm" : "P_Mot";

  const scale = printedPs / peak.pEnginePs;
  const suspicious = Math.abs(scale - 1) > ANCHOR_WARN;

  if (!applyScale) {
    return { points, anchor: { scale, applied: false, readPs: peak.pEnginePs, printedPs, printedField, suspicious } };
  }

  const scaled = points.map((p) => ({
    rpm: p.rpm,
    // P-Rad und P-Schlepp mitskalieren: sie stammen aus demselben Diagramm und
    // hätten sonst eine andere Systematik als die Motorkurve.
    pWheelPs: p.pWheelPs == null ? null : +(p.pWheelPs * scale).toFixed(1),
    pDragPs: p.pDragPs == null ? null : +(p.pDragPs * scale).toFixed(1),
    pEnginePs: +(p.pEnginePs * scale).toFixed(1),
  }));

  return { points: scaled, anchor: { scale, applied: true, readPs: peak.pEnginePs, printedPs, printedField, suspicious } };
}

/**
 * Extraktion in einen DynoRun überführen: aufräumen, ergänzen, verankern.
 * Das Ergebnis ist ein Vorschlag für den Dialog, kein fertiger Datensatz.
 *
 * `source` entscheidet, ob die Verankerung die Kurve tatsächlich verändert:
 * nur bei "vision" (Foto/Scan, siehe anchorCurve()).
 */
export function sheetToRun(sheet: DynoSheet, source: DynoRun["source"]): {
  run: DynoRun;
  rpmFactor: number | null;
  anchor: AnchorInfo;
} {
  const raw: DynoPoint[] = (sheet.curve ?? [])
    .map((c) => {
      const rpm = fin(c.rpm);
      if (rpm == null || rpm <= 0) return null;
      const pWheel = fin(c.pWheelPs);
      const pDrag = fin(c.pDragPs);
      const pEngine = fin(c.pEnginePs) ?? (pWheel != null && pDrag != null ? pWheel + pDrag : null);
      if (pEngine == null) return null;
      return { rpm, pWheelPs: pWheel, pDragPs: pDrag, pEnginePs: pEngine };
    })
    .filter((p): p is DynoPoint => p !== null)
    .sort((a, b) => a.rpm - b.rpm);

  const { points, anchor } = anchorCurve(raw, sheet.printed, source === "vision");

  const measured = sheet.measuredAt ? Date.parse(sheet.measuredAt) : NaN;
  const env = sheet.env && (fin(sheet.env.tempC) != null || fin(sheet.env.pressureHpa) != null || fin(sheet.env.rh) != null)
    ? sheet.env
    : undefined;

  const p = sheet.printed;
  const nmNorm = fin(p?.nmNorm)
    ?? (fin(p?.psNorm) != null && fin(p?.psRpm) != null
      ? NM_PER_PS_RPM * (p!.psNorm as number) / (p!.psRpm as number)
      : undefined);

  const run: DynoRun = {
    points,
    correctedBy: sheet.correctedBy ?? "none",
    source,
    ...(sheet.bench ? { bench: sheet.bench } : {}),
    ...(sheet.operator ? { operator: sheet.operator } : {}),
    ...(Number.isFinite(measured) ? { measuredAt: measured } : {}),
    ...(env ? { env } : {}),
    peaks: {
      ...(fin(p?.psNorm) != null ? { psNorm: p!.psNorm } : {}),
      ...(fin(p?.psRpm) != null ? { psRpm: p!.psRpm } : {}),
      ...(nmNorm != null ? { nmNorm } : {}),
      ...(fin(p?.nmRpm) != null ? { nmRpm: p!.nmRpm } : {}),
      ...(fin(p?.psWheel) != null ? { psWheel: p!.psWheel } : {}),
      ...(fin(p?.psDrag) != null ? { psDrag: p!.psDrag } : {}),
      ...(fin(p?.maxRpm) != null ? { maxRpm: p!.maxRpm } : {}),
    },
  };

  return { run, rpmFactor: rpmFactorFromSheet(sheet.printed), anchor };
}

/**
 * Protokoll serverseitig auslesen lassen. Das Ergebnis ist ein Vorschlag für
 * den Dialog – gespeichert wird erst, wenn der Nutzer ihn bestätigt hat.
 */
export async function extractDynoSheet(file: File): Promise<DynoSheet> {
  const { invokeEdgeFunction } = await import("./events");
  const { supabase } = await import("@/integrations/supabase/client");

  // Vorab prüfen statt den Nutzer in einen 401 des Gateways laufen zu lassen:
  // verify_jwt greift, bevor die Function überhaupt startet, ihre eigene
  // Meldung käme also nie an. Die App ist local-first und ohne Anmeldung
  // benutzbar – nur dieses eine Extra braucht ein Konto.
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    throw new Error(
      "Zum Auslesen eines Protokolls musst du angemeldet sein (die Auswertung läuft auf dem Server).",
    );
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  // In Blöcken kodieren, sonst sprengt ein großes Foto das Call-Stack-Limit.
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  const mediaType = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "image/jpeg");
  return invokeEdgeFunction<DynoSheet>("extract-dyno-sheet", {
    fileBase64: btoa(binary),
    mediaType,
  });
}
