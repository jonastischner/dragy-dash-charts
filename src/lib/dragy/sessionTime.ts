// Aufnahmezeitpunkt einer Session bestimmen und benennen.
//
// Die Zeit kommt in dieser Reihenfolge: aus der GPS-Zeit der Rohdaten
// (genau, zeitzonensicher), sonst aus dem Dateinamen – Dragy benennt seine
// Exporte nach dem Unix-Zeitstempel der Aufnahme. Gibt beides nichts her,
// bleibt es beim Dateinamen als Session-Name.

/** Plausibler Bereich für Aufnahme-Zeitstempel: ab 2015 bis 2100. */
const MIN_EPOCH_S = 1420070400; // 2015-01-01
const MAX_EPOCH_S = 4102444800; // 2100-01-01

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * „20.08.2026 22:04" – in der Zeitzone des Geräts.
 *
 * Gespeichert wird immer der zeitzonenfreie Epoch-Wert; erst hier wird
 * daraus Ortszeit. Ein in Spanien aufgenommener Lauf zeigt zu Hause also
 * die heimische Uhrzeit – das ist der übliche Kompromiss, solange wir die
 * Zeitzone der Aufnahme nicht mitspeichern.
 */
export function formatSessionTime(ms: number): string {
  const d = new Date(ms);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/**
 * Der Zeitpunkt, der eine Session fachlich datiert: wann gefahren wurde, nicht
 * wann importiert. Altdaten und Tabellen-Exporte haben kein recordedAt und
 * fallen auf createdAt zurück – für die bleibt es beim bisherigen Verhalten.
 */
export function sessionTimestamp(s: { recordedAt?: number; createdAt: number }): number {
  return s.recordedAt ?? s.createdAt;
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
