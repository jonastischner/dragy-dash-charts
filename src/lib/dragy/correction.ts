// Normkorrektur der Motorleistung nach DIN 70020 bzw. EWG 80/1269 (= ISO 1585).
//
// EXPERIMENTELL: standardmäßig ausgeschaltet. Der Faktor alpha wird ausschließlich
// auf die *Motor*leistung (und damit automatisch auf das Motor-Drehmoment)
// angewendet – die gemessene Radleistung bleibt unangetastet.
//
// Wichtig zur Einordnung: Die Luftdichte wirkt in dieser App an zwei völlig
// unabhängigen Stellen, hier wird also nichts doppelt gezählt:
//   1. physikalisch auf die Messung – Luftwiderstand 0.5*rho*cdA*v^2 (physics.ts)
//   2. normierend auf die Motorabgabe – der alpha-Faktor hier
//
// Beide Normen gelten hier nur für Ottomotoren. Die Diesel-Variante der EWG
// (alpha_d = alpha_fa^fm) braucht den Kraftstoffdurchsatz, der sich aus reinen
// GPS-Daten nicht bestimmen lässt – sie wird bewusst nicht angeboten, statt eine
// Genauigkeit vorzutäuschen, die die Datenlage nicht hergibt.

import { vaporPressureHpa } from "./physics";

export type CorrectionStandard = "none" | "din70020" | "ewg80_1269";

export const CORRECTION_LABEL: Record<CorrectionStandard, string> = {
  none: "Aus (Messwerte)",
  din70020: "DIN 70020",
  ewg80_1269: "EWG 80/1269",
};

/** Kurzbeschreibung der Referenzbedingungen je Norm (für die UI). */
export const CORRECTION_REFERENCE: Record<CorrectionStandard, string> = {
  none: "Keine Korrektur – es werden die aus der Messung berechneten Werte gezeigt.",
  din70020:
    "Referenz 1013 hPa / 20 °C. Rechnet mit dem Gesamtluftdruck, die Luftfeuchte geht nicht ein.",
  ewg80_1269:
    "Referenz 990 hPa Trockendruck / 25 °C. Berücksichtigt die Luftfeuchte über den Wasserdampf-Partialdruck; gültig nur für 0,93 ≤ α ≤ 1,07.",
};

/** Gültigkeitsgrenzen des Korrekturfaktors nach EWG 80/1269. */
export const EWG_ALPHA_MIN = 0.93;
export const EWG_ALPHA_MAX = 1.07;

export interface CorrectionResult {
  standard: CorrectionStandard;
  /** Multiplikator auf Motorleistung und Motor-Drehmoment. Bei "none" exakt 1. */
  alpha: number;
  /**
   * Wurde tatsächlich korrigiert? False, wenn keine Norm gewählt ist ODER die
   * dafür nötigen Umgebungsdaten der Session fehlen. Aufrufer sollten hierauf
   * prüfen, nicht auf `standard !== "none"`.
   */
  applied: boolean;
  /** Fehlende Umgebungsangaben (Klartext, für die UI). Leer, wenn vollständig. */
  missing: string[];
  /** Liegt alpha im nach EWG zulässigen Bereich? Für "none"/DIN immer true. */
  inRange: boolean;
  /** Wasserdampf-Partialdruck e in hPa. */
  vaporPressureHpa: number;
  /** Trockendruck p - e in hPa. */
  dryPressureHpa: number;
}

/** Welche Umgebungswerte die jeweilige Norm zwingend braucht. */
const REQUIRED: Record<CorrectionStandard, Array<"tempC" | "pressureHpa" | "rh">> = {
  none: [],
  // DIN rechnet mit dem Gesamtdruck – die Luftfeuchte wird nicht benötigt.
  din70020: ["tempC", "pressureHpa"],
  // EWG normiert auf den Trockendruck und braucht deshalb auch die Feuchte.
  ewg80_1269: ["tempC", "pressureHpa", "rh"],
};

const FIELD_LABEL = { tempC: "Temperatur", pressureHpa: "Luftdruck", rh: "Luftfeuchte" } as const;

/**
 * Korrekturfaktor für die angegebenen Umgebungsbedingungen.
 *
 * DIN 70020:    alpha = (1013 / p)   * sqrt(T / 293)
 * EWG 80/1269:  alpha = (990  / p_d)^1.2 * (T / 298)^0.6      mit p_d = p - e
 *
 * p in hPa, T in Kelvin. Bei "none" wird alpha = 1 zurückgegeben, damit
 * Aufrufer bedingungslos multiplizieren können.
 *
 * Hinweis (kein Rundungsfehler): Die Normen sind mit den gerundeten
 * Referenztemperaturen 293 K bzw. 298 K formuliert, nicht mit 293,15/298,15 K.
 * Dadurch ergibt sich exakt an der Referenzbedingung alpha = 1,0003 statt
 * 1,0000. Das ist normkonform und wird bewusst nicht "korrigiert".
 */
export function correctionFactor(
  standard: CorrectionStandard,
  tempC?: number,
  pressureHpa?: number,
  rh?: number,
): CorrectionResult {
  const env = { tempC, pressureHpa, rh };
  // Fehlend heißt: nie eingetragen. Ohne echte Messwerte wird bewusst NICHT
  // korrigiert – ein Faktor aus Standardwerten wäre eine erfundene Zahl.
  const missing = REQUIRED[standard]
    .filter((k) => env[k] == null || !Number.isFinite(env[k] as number))
    .map((k) => FIELD_LABEL[k]);

  const e = vaporPressureHpa(tempC ?? 0, rh ?? 0);
  const dry = (pressureHpa ?? 0) - e;
  const none: CorrectionResult = {
    standard,
    alpha: 1,
    applied: false,
    missing,
    inRange: true,
    vaporPressureHpa: e,
    dryPressureHpa: dry,
  };

  if (standard === "none" || missing.length > 0) return none;

  const T = (tempC as number) + 273.15;
  const p = pressureHpa as number;
  // Physikalisch unmögliche Eingaben dürfen die Anzeige nicht zerstören.
  if (p <= 0 || T <= 0) return none;

  if (standard === "din70020") {
    return { ...none, alpha: (1013 / p) * Math.sqrt(T / 293), applied: true };
  }

  if (standard === "ewg80_1269") {
    if (dry <= 0) return none;
    const alpha = Math.pow(990 / dry, 1.2) * Math.pow(T / 298, 0.6);
    return {
      ...none,
      alpha,
      applied: true,
      inRange: alpha >= EWG_ALPHA_MIN && alpha <= EWG_ALPHA_MAX,
    };
  }

  return none;
}

/** Anzeigetext für den aktiven Faktor, z. B. "EWG 80/1269 · α = 1,024". */
export function formatCorrection(result: CorrectionResult): string {
  return `${CORRECTION_LABEL[result.standard]} · α = ${result.alpha.toFixed(3).replace(".", ",")}`;
}
