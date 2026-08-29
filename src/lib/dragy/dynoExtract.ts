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

export interface AddedPoint { rpm: number; ps: number; field: "P_Norm" | "M_Norm" }

export interface AnchorInfo {
  /**
   * Zusätzliche Stützpunkte, die aus den gedruckten Spitzenwerten in die
   * Kurve eingefügt wurden – leer, wenn keiner nötig war.
   */
  added: AddedPoint[];
}

/**
 * Die gedruckten Spitzenwerte (P_Norm, M_Norm) sind auf einem Prüfstands-
 * protokoll bereits normkorrigiert – GENAU DIESELBE Größe wie die Kurve
 * selbst, nicht ein unabhängiger, "genauerer" Wert einer anderen Größe. Sie
 * je in eine SKALIERUNG der ganzen Kurve umzumünzen war deshalb falsch: eine
 * frühere Fassung verschob die komplette Kurve um einen Faktor, sobald ihr
 * eigenes Maximum (auf dem festen Drehzahlraster der Vorlage) den gedruckten
 * Wert nicht exakt traf – das verändert JEDEN Wert, nicht nur die Spitze, und
 * zerstört damit die eingetragenen bzw. abgelesenen Messwerte.
 *
 * Der eigentliche Grund für die Abweichung ist simpler: das Protokoll nennt
 * die Spitze an ihrer EXAKTEN Drehzahl (z.B. 8320 U/min), während die Tabelle
 * nur ein festes Raster (z.B. alle 250 U/min: 8250, 8500, …) abdeckt. Die
 * Spitze liegt fast immer zwischen zwei eingetragenen Zeilen und fehlt der
 * Kurve deshalb schlicht als Stützpunkt – kein Fehler, keine Ungenauigkeit.
 *
 * Der richtige Fix: die gedruckte Spitze (Wert + genaue Drehzahl) als
 * zusätzlichen, eigenen Stützpunkt einfügen, statt die Kurve zu verschieben.
 * Alle anderen Punkte bleiben exakt so stehen, wie sie eingetragen bzw.
 * gelesen wurden. Ergänzt wird sowohl aus P_Norm (Leistung, direkt) als auch
 * aus M_Norm (Drehmoment, über M = 7023,8·PS/n in eine Leistung umgerechnet)
 * – beides eigene, an ihrer jeweils eigenen Drehzahl gemessene Spitzenwerte.
 */
export function fillPrintedPeaks(
  points: DynoPoint[],
  printed: DynoSheet["printed"],
): { points: DynoPoint[]; anchor: AnchorInfo } {
  const result = [...points];
  const added: AddedPoint[] = [];
  const hasRpm = (rpm: number) => result.some((p) => p.rpm === rpm);

  const psNorm = fin(printed?.psNorm);
  const psRpm = fin(printed?.psRpm);
  if (psNorm != null && psNorm > 0 && psRpm != null && psRpm > 0 && !hasRpm(psRpm)) {
    result.push({ rpm: psRpm, pWheelPs: null, pDragPs: null, pEnginePs: psNorm });
    added.push({ rpm: psRpm, ps: psNorm, field: "P_Norm" });
  }

  const nmNorm = fin(printed?.nmNorm);
  const nmRpm = fin(printed?.nmRpm);
  if (nmNorm != null && nmNorm > 0 && nmRpm != null && nmRpm > 0 && !hasRpm(nmRpm)) {
    const ps = +(nmNorm * nmRpm / NM_PER_PS_RPM).toFixed(1);
    result.push({ rpm: nmRpm, pWheelPs: null, pDragPs: null, pEnginePs: ps });
    added.push({ rpm: nmRpm, ps, field: "M_Norm" });
  }

  result.sort((a, b) => a.rpm - b.rpm);
  return { points: result, anchor: { added } };
}

/**
 * Extraktion in einen DynoRun überführen: aufräumen, ergänzen, verankern.
 * Das Ergebnis ist ein Vorschlag für den Dialog, kein fertiger Datensatz.
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

  const { points, anchor } = fillPrintedPeaks(raw, sheet.printed);

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
