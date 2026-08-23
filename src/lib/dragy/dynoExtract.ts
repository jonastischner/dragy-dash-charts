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
  /** Faktor, mit dem die abgelesene Motorkurve auf den gedruckten Spitzenwert gebracht wurde. */
  scale: number;
  /** Abgelesene Spitzenleistung vor der Verankerung. */
  readPs: number | null;
  /** Gedruckte Spitzenleistung, an der verankert wurde. */
  printedPs: number | null;
  /** Auffällig große Korrektur – dann war das Ablesen schlecht und der Nutzer muss hinsehen. */
  suspicious: boolean;
}

/** Ab dieser Abweichung gilt das Ablesen als unzuverlässig. */
export const ANCHOR_WARN = 0.05;

/**
 * Kurve an den gedruckten Eckwerten verankern. Ohne gedruckte Werte bleibt die
 * abgelesene Kurve unverändert – dann ist sie eben nur so gut wie das Ablesen.
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
): { points: DynoPoint[]; anchor: AnchorInfo } {
  const none: AnchorInfo = { scale: 1, readPs: null, printedPs: null, suspicious: false };
  if (points.length === 0) return { points, anchor: none };

  let peak = points[0];
  for (const p of points) if (p.pEnginePs > peak.pEnginePs) peak = p;

  const printedPs = fin(printed?.psNorm) ?? fin(printed?.psEngine);
  if (printedPs == null || printedPs <= 0 || peak.pEnginePs <= 0) {
    return { points, anchor: { ...none, readPs: peak.pEnginePs, printedPs } };
  }

  const scale = printedPs / peak.pEnginePs;

  const scaled = points.map((p) => ({
    rpm: p.rpm,
    // P-Rad und P-Schlepp mitskalieren: sie stammen aus demselben Diagramm und
    // hätten sonst eine andere Systematik als die Motorkurve.
    pWheelPs: p.pWheelPs == null ? null : +(p.pWheelPs * scale).toFixed(1),
    pDragPs: p.pDragPs == null ? null : +(p.pDragPs * scale).toFixed(1),
    pEnginePs: +(p.pEnginePs * scale).toFixed(1),
  }));

  return {
    points: scaled,
    anchor: {
      scale, readPs: peak.pEnginePs, printedPs,
      suspicious: Math.abs(scale - 1) > ANCHOR_WARN,
    },
  };
}

/**
 * Extraktion in einen DynoRun überführen: aufräumen, ergänzen, verankern.
 * Das Ergebnis ist ein Vorschlag für den Dialog, kein fertiger Datensatz.
 */
export function sheetToRun(sheet: DynoSheet): {
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

  const { points, anchor } = anchorCurve(raw, sheet.printed);

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
    source: "vision",
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
