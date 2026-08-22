// Aufnahmezeitpunkt einer Session bestimmen und benennen.
//
// Die Zeit kommt in dieser Reihenfolge: aus der GPS-Zeit der Rohdaten
// (genau, zeitzonensicher), sonst aus dem Dateinamen – Dragy benennt seine
// Exporte nach dem Unix-Zeitstempel der Aufnahme. Gibt beides nichts her,
// bleibt es beim Dateinamen als Session-Name.

import { compareNamesDesc } from "./sort";

/** Plausibler Bereich für Aufnahme-Zeitstempel: ab 2015 bis 2100. */
const MIN_EPOCH_S = 1420070400; // 2015-01-01
const MAX_EPOCH_S = 4102444800; // 2100-01-01

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * „2026-08-20 22:04" – in der Zeitzone des Geräts.
 *
 * ISO-Reihenfolge (Jahr, Monat, Tag) mit Absicht: die Listen sind alphabetisch
 * sortiert, und nur in dieser Reihenfolge fällt alphabetisch mit chronologisch
 * zusammen. Mit „20.08.2026" würde nach Tag vor Monat sortiert, ein Lauf vom
 * 5. September stünde also vor einem vom 20. August.
 *
 * Gespeichert wird immer der zeitzonenfreie Epoch-Wert; erst hier wird
 * daraus Ortszeit. Ein in Spanien aufgenommener Lauf zeigt zu Hause also
 * die heimische Uhrzeit – das ist der übliche Kompromiss, solange wir die
 * Zeitzone der Aufnahme nicht mitspeichern.
 */
export function formatSessionTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/**
 * Datum aus einem Session-Namen lesen. Altdaten heißen nach ihrer Quelldatei und
 * tragen ihr Datum oft im Namen – mal als ISO (2026-08-06), mal deutsch
 * (27-07-2026). Ohne diese Auswertung landen alle TT-MM-JJJJ-Namen in der
 * Sortierung geschlossen unten, weil der Collator die erste Zahlengruppe
 * vergleicht: beim einen ist das das Jahr, beim anderen der Tag.
 *
 * Bewusst nur am Namensanfang verankert – ein „-3" am Ende ist ein Zähler, kein
 * Datumsteil. Eine Uhrzeit wird nur mit Doppelpunkt erkannt (so schreibt sie
 * formatSessionTime); „2026-08-20 17-1" ist zu mehrdeutig für eine Uhrzeit.
 */
export function dateFromName(name: string): number | null {
  const t = name.trim();
  let y: number, mo: number, d: number;
  const iso = /^(\d{4})[-.](\d{1,2})[-.](\d{1,2})/.exec(t);
  const de = /^(\d{1,2})[-.](\d{1,2})[-.](\d{4})/.exec(t);
  if (iso) { y = +iso[1]; mo = +iso[2]; d = +iso[3]; }
  else if (de) { d = +de[1]; mo = +de[2]; y = +de[3]; }
  else return null;
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  let h = 0, mi = 0;
  const time = /\s(\d{1,2}):(\d{2})/.exec(t);
  if (time && +time[1] <= 23 && +time[2] <= 59) { h = +time[1]; mi = +time[2]; }

  const ms = new Date(y, mo - 1, d, h, mi).getTime();
  // Round-Trip verwirft Unsinn wie den 31. Februar.
  const back = new Date(ms);
  if (back.getFullYear() !== y || back.getMonth() !== mo - 1 || back.getDate() !== d) return null;
  return ms;
}

/**
 * Der Zeitpunkt, der eine Session fachlich datiert: wann gefahren wurde, nicht
 * wann importiert.
 *
 * Reihenfolge: recordedAt (neue Importe, GPS-genau) → Datum aus dem Namen
 * (Altdaten) → createdAt als letzter Rückfall.
 */
export function sessionTimestamp(s: { recordedAt?: number; createdAt: number; name?: string }): number {
  if (s.recordedAt != null) return s.recordedAt;
  const fromName = s.name ? dateFromName(s.name) : null;
  return fromName ?? s.createdAt;
}

/**
 * Sessions chronologisch absteigend – neueste zuerst. Bei gleichem Datum
 * entscheidet der Name absteigend, damit „…-3" vor „…-2" steht; die id hält die
 * Reihenfolge stabil, wenn auch der Name gleich ist.
 */
export function compareSessionsDesc(
  a: { id: string; name: string; recordedAt?: number; createdAt: number },
  b: { id: string; name: string; recordedAt?: number; createdAt: number },
): number {
  return (sessionTimestamp(b) - sessionTimestamp(a))
    || compareNamesDesc(a.name, b.name)
    || b.id.localeCompare(a.id);
}

/** Dateiname ohne bekannte Endung – Rückfall für den Session-Namen. */
export function stripExtension(fileName: string): string {
  return fileName.replace(/\.(data|ubx|csv|txt|tsv|xlsx|xlsm|xls)$/i, "");
}

/**
 * Unix-Zeitstempel aus einem Dragy-Dateinamen (z.B. „1787256283.data").
 * Akzeptiert Sekunden (10 Stellen) und Millisekunden (13 Stellen), auch mit
 * vorangestelltem Präfix wie „dragy_1787256283". null, wenn nichts passt.
 */
export function timestampFromFilename(fileName: string): number | null {
  const base = stripExtension(fileName);
  const m = /(?:^|[-_ ])(\d{10}|\d{13})$/.exec(base);
  if (!m) return null;
  const raw = Number(m[1]);
  if (!Number.isFinite(raw)) return null;
  const seconds = m[1].length === 13 ? raw / 1000 : raw;
  if (seconds < MIN_EPOCH_S || seconds > MAX_EPOCH_S) return null;
  return Math.round(seconds * 1000);
}

export interface SessionNaming {
  /** Aufnahmezeitpunkt als Epoch-ms, oder null wenn unbekannt. */
  recordedAt: number | null;
  /** Fertiger Session-Name. */
  name: string;
}

/**
 * Name und Aufnahmezeit für eine importierte Datei bestimmen.
 * `startedAt` ist die GPS-Zeit aus den Rohdaten und hat Vorrang – sie ist
 * genauer als der Dateiname, der erst beim Speichern vergeben wird.
 */
export function nameImportedSession(fileName: string, startedAt: number | null): SessionNaming {
  const recordedAt = startedAt ?? timestampFromFilename(fileName);
  return {
    recordedAt,
    name: recordedAt != null ? formatSessionTime(recordedAt) : stripExtension(fileName),
  };
}
