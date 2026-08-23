// Läufe aus mehreren Dragy-Dateien in einer Session zusammenfassen.
//
// Wer vor jeder Messung das Gerät neu startet, bekommt pro Lauf eine eigene
// Datei. Fachlich sind das Läufe einer Ausfahrt, keine getrennten Sessions.
// Beim Anhängen wird die Zeitachse der neuen Datei hinter die bestehende
// gesetzt und der Bereich als Lauf markiert.

import { uid } from "./db";
import type { DynoRun, Record as R, RunCategory, Segment, Session } from "./types";

/**
 * Lücke zwischen zwei angehängten Läufen in Sekunden. Bewusst nicht 0: im
 * Geschwindigkeitsverlauf der Session sollen die Läufe als getrennte Blöcke
 * erkennbar sein und nicht zu einer durchgehenden Kurve verschmelzen.
 */
export const RUN_GAP_S = 5;

export interface AppendRunOptions {
  name: string;
  color: string;
  rpmFactor: number;
  category?: RunCategory;
  /** Aufnahmezeit der Quelldatei, damit sie durch das Umrechnen nicht verlorengeht. */
  startedAt?: number | null;
}

/**
 * Hängt die Punkte einer weiteren Messung an eine Session an und liefert die
 * aktualisierte Session samt dem Lauf, der den neuen Bereich abdeckt.
 * Beide Objekte sind neu – der Aufrufer speichert sie selbst.
 */
export function appendRunToSession(
  session: Session,
  records: R[],
  opts: AppendRunOptions,
): { session: Session; segment: Segment } {
  if (records.length === 0) throw new Error("Keine Datenpunkte zum Anhängen");

  const lastT = session.records.length ? session.records[session.records.length - 1].t : null;
  const base = lastT == null ? 0 : lastT + RUN_GAP_S;

  // Die Quelldatei beginnt bei ihrer eigenen t=0; auf die Session-Achse schieben.
  const t0 = records[0].t;
  const shifted = records.map((r) => ({ ...r, t: r.t - t0 + base }));
  const endT = shifted[shifted.length - 1].t;

  const segment: Segment = {
    id: uid(),
    sessionId: session.id,
    name: opts.name,
    startT: base,
    endT,
    rpmFactor: opts.rpmFactor,
    color: opts.color,
    visible: true,
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.startedAt != null ? { recordedAt: opts.startedAt } : {}),
  };

  return {
    session: { ...session, records: [...session.records, ...shifted] },
    segment,
  };
}

/**
 * Dasselbe für eine gemessene Prüfstandskurve. Sie bringt keine Records mit –
 * das Segment bekommt nur einen freien Abschnitt auf der Zeitachse der Session,
 * damit es sich nicht mit den GPS-Läufen überlappt. session.records bleibt
 * unangetastet, deshalb ein eigener Weg statt appendRunToSession().
 */
export function appendDynoRunToSession(
  session: Session,
  dyno: DynoRun,
  opts: Omit<AppendRunOptions, "startedAt"> & {
    /** Bereits vorhandene Läufe der Session, damit sich die Abschnitte nicht überlappen. */
    existing?: Pick<Segment, "endT">[];
  },
): Segment {
  if (dyno.points.length === 0) throw new Error("Keine Messpunkte in der Kurve");

  const lastT = session.records.length ? session.records[session.records.length - 1].t : 0;
  // Eine reine Prüfstands-Session hat keine Records; dann bestimmt das Ende des
  // letzten Laufs, wo der nächste anfängt.
  const lastSegEnd = (opts.existing ?? []).reduce((m, g) => Math.max(m, g.endT), 0);
  const occupied = Math.max(lastT, lastSegEnd);
  const base = occupied > 0 ? occupied + RUN_GAP_S : 0;
  // Eine Sekunde je Stützpunkt: die Zeitachse ist bei einer Prüfstandskurve
  // ohne Bedeutung, sie muss nur monoton sein und sich nicht überschneiden.
  const endT = base + Math.max(dyno.points.length - 1, 1);

  return {
    id: uid(),
    sessionId: session.id,
    name: opts.name,
    startT: base,
    endT,
    rpmFactor: opts.rpmFactor,
    color: opts.color,
    visible: true,
    dyno,
    ...(opts.category ? { category: opts.category } : {}),
    ...(dyno.measuredAt != null ? { recordedAt: dyno.measuredAt } : {}),
  };
}
