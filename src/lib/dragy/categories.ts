import type { RunCategory, Segment, Session, SessionKind } from "./types";

export const RUN_CATEGORY_LABEL: Record<RunCategory, string> = {
  power: "Leistungsmessung (z.B. 60–200)",
  accel: "Beschleunigung (0–100, 1/4 Meile)",
  coastdown: "Coastdown / Ausrollen",
  stage: "Rallye-Stage",
  lap: "Rundstreckenrunde",
};

export const RUN_CATEGORY_SHORT: Record<RunCategory, string> = {
  power: "Leistung",
  accel: "Beschleunigung",
  coastdown: "Coastdown",
  stage: "Stage",
  lap: "Runde",
};

export const SESSION_KIND_LABEL: Record<SessionKind, string> = {
  performance: "Leistung & Beschleunigung",
  rally: "Rallye-Stages",
  circuit: "Rundstrecke",
};

/** Modul, in dem eine Session liegt (Altdaten = performance). */
export function sessionKind(s: Session): SessionKind {
  return s.kind ?? "performance";
}

/** Kategorie eines Laufs (Altdaten = power). */
export function runCategory(g: Segment): RunCategory {
  return g.category ?? "power";
}

/** Standard-Kategorie für neue Läufe je Modul. */
export function defaultCategoryFor(kind: SessionKind): RunCategory {
  if (kind === "rally") return "stage";
  if (kind === "circuit") return "lap";
  return "power";
}

/** Welche Kategorien in einem Modul auswählbar sind. */
export function categoriesFor(kind: SessionKind): RunCategory[] {
  if (kind === "rally") return ["stage", "accel"];
  if (kind === "circuit") return ["lap", "accel"];
  return ["power", "accel", "coastdown"];
}

/** Läufe dieser Kategorie werden über Drehzahl als Leistung/Drehmoment ausgewertet. */
export function hasPowerCurve(g: Segment): boolean {
  const c = runCategory(g);
  return c === "power" || c === "coastdown";
}
