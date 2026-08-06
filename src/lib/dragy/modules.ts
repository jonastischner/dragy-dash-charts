import type { ModuleId, Segment, Session } from "./types";

export const MODULE_IDS: ModuleId[] = ["power", "accel", "rally", "circuit"];

export const MODULE_LABEL: Record<ModuleId, string> = {
  power: "Leistung & Drehmoment",
  accel: "Beschleunigung",
  rally: "Rallye-Stages",
  circuit: "Rundstrecke",
};

export const MODULE_SHORT: Record<ModuleId, string> = {
  power: "Leistung",
  accel: "Beschleunigung",
  rally: "Rallye",
  circuit: "Rundstrecke",
};

export const MODULE_DESC: Record<ModuleId, string> = {
  power: "Läufe im festen Gang (z.B. 60–200 km/h) als Leistungs- und Drehmomentkurve über Drehzahl.",
  accel: "Gangübergreifende Beschleunigung: Split-Zeiten, 1/4 Meile, km/h über Zeit.",
  rally: "Stages: Zeit, Distanz und Geschwindigkeitsverlauf über die Strecke.",
  circuit: "Runden: Rundenzeit, Distanz und Speed-Trace über die Strecke.",
};

/** Kurz-Hinweis, was pro Modul ausgewertet wird (für Tiles/Header). */
export const MODULE_METRIC: Record<ModuleId, string> = {
  power: "Peak PS / Nm",
  accel: "0–100 km/h",
  rally: "Stage-Zeit",
  circuit: "Rundenzeit",
};

/** Modul einer Session – Altdaten werden aus kind/category abgeleitet. */
export function sessionModule(s: Session): ModuleId {
  if (s.module) return s.module;
  if (s.kind === "rally") return "rally";
  if (s.kind === "circuit") return "circuit";
  return "power";
}

/**
 * Migration: leitet für Altdaten das Modul ab. Performance-Sessions, deren
 * Läufe ausschließlich als "accel" markiert waren, landen im Beschleunigungs-Modul.
 */
export function migrateSessionModule(s: Session, segs: Segment[]): ModuleId {
  if (s.module) return s.module;
  if (s.kind === "rally") return "rally";
  if (s.kind === "circuit") return "circuit";
  const cats = segs.map((g) => g.category ?? "power");
  if (cats.length > 0 && cats.every((c) => c === "accel")) return "accel";
  return "power";
}

/** In diesem Modul werden Kurven über Drehzahl (Leistung/Drehmoment) ausgewertet. */
export function isPowerModule(m: ModuleId): boolean {
  return m === "power";
}

/** Modul mit Distanz-basierter Auswertung (Stage/Runde). */
export function isTrackModule(m: ModuleId): boolean {
  return m === "rally" || m === "circuit";
}
