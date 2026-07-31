import type { Record as R } from "./types";

// Import von Tabellen-Exporten (CSV/TSV/Excel) z.B. von P-Gear / Dragy / Racebox.
// Erwartet eine Kopfzeile mit Spalten wie "Speed(km/h)", "Time", "Distance(m)", "Altitude(m)".

export type Grid = (string | number)[][];

const num = (v: string | number | undefined): number | null => {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = v.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export function parseDelimited(text: string): Grid {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== "");
  const delim = (() => {
    const head = lines.find((l) => /[,;\t]/.test(l)) ?? "";
    const counts: Array<[string, number]> = [
      ["\t", (head.match(/\t/g) ?? []).length],
      [";", (head.match(/;/g) ?? []).length],
      [",", (head.match(/,/g) ?? []).length],
    ];
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 0 ? counts[0][0] : ",";
  })();
  return lines.map((l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, "")));
}

export async function parseSpreadsheet(buf: ArrayBuffer): Promise<Grid> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, blankrows: false, raw: true });
}

type ColMap = { speed: number; time: number | null; dist: number | null; alt: number | null; unitMph: boolean };

function findHeader(grid: Grid): { row: number; cols: ColMap } | null {
  const limit = Math.min(grid.length, 20);
  for (let r = 0; r < limit; r++) {
    const cells = grid[r].map((c) => String(c ?? "").toLowerCase());
    const idxOf = (pred: (s: string) => boolean) => cells.findIndex(pred);
    const speed = idxOf((s) => s.includes("speed") || s.includes("geschw") || s.includes("km/h") || s.includes("mph"));
    if (speed < 0) continue;
    const time = idxOf((s) => /^(time|zeit|t)\b/.test(s) || s.includes("time(") || s.includes("elapsed") || s.includes("sekund"));
    const dist = idxOf((s) => s.includes("distance") || s.includes("distanz") || s.includes("strecke"));
    const alt = idxOf((s) => s.includes("altitude") || s.includes("höhe") || s.includes("hoehe") || s.includes("height"));
    const unitMph = cells[speed].includes("mph") && !cells[speed].includes("km/h");
    return { row: r, cols: { speed, time: time < 0 ? null : time, dist: dist < 0 ? null : dist, alt: alt < 0 ? null : alt, unitMph } };
  }
  return null;
}

export function gridToRecords(grid: Grid): { records: R[]; info: string } {
  const head = findHeader(grid);
  if (!head) throw new Error("Keine Kopfzeile mit Geschwindigkeitsspalte gefunden");
  const { cols } = head;

  const rows: Array<{ speed: number; time: number | null; dist: number | null; alt: number | null }> = [];
  for (let r = head.row + 1; r < grid.length; r++) {
    const line = grid[r];
    const speed = num(line[cols.speed]);
    if (speed === null) continue;
    rows.push({
      speed: cols.unitMph ? speed * 1.609344 : speed,
      time: cols.time !== null ? num(line[cols.time]) : null,
      dist: cols.dist !== null ? num(line[cols.dist]) : null,
      alt: cols.alt !== null ? num(line[cols.alt]) : null,
    });
  }
  if (rows.length < 3) throw new Error("Zu wenige Datenzeilen");

  // Zeitachse bestimmen
  let times: number[];
  let info: string;
  const hasTime = rows.every((r) => r.time !== null) && (rows[rows.length - 1].time as number) > (rows[0].time as number);
  if (hasTime) {
    const t0 = rows[0].time as number;
    times = rows.map((r) => (r.time as number) - t0);
    // Millisekunden erkennen (Gesamtdauer unplausibel groß)
    if (times[times.length - 1] > 600) { times = times.map((t) => t / 1000); info = "Zeitspalte (ms)"; }
    else info = "Zeitspalte (s)";
  } else if (rows.every((r) => r.dist !== null)) {
    // Abtastrate aus Strecke/Geschwindigkeit ableiten
    let sum = 0, n = 0;
    for (let i = 1; i < rows.length; i++) {
      const ds = (rows[i].dist as number) - (rows[i - 1].dist as number);
      const v = ((rows[i].speed + rows[i - 1].speed) / 2) / 3.6;
      if (ds > 0 && v > 1) { sum += ds / v; n++; }
    }
    const dtRaw = n > 0 ? sum / n : 0.1;
    // auf gängige Raten runden (20/10/5/1 Hz)
    const cands = [0.05, 0.1, 0.2, 1];
    const dt = cands.reduce((a, b) => (Math.abs(b - dtRaw) < Math.abs(a - dtRaw) ? b : a), cands[0]);
    times = rows.map((_, i) => i * dt);
    info = `Abtastrate aus Strecke abgeleitet (${Math.round(1 / dt)} Hz)`;
  } else {
    times = rows.map((_, i) => i * 0.1);
    info = "Annahme 10 Hz (keine Zeit-/Streckenspalte)";
  }

  const records: R[] = rows.map((r, i) => ({
    t: times[i],
    speedKmh: r.speed,
    heightM: r.alt ?? 0,
  }));
  return { records, info };
}

export async function parseTableFile(file: File): Promise<{ records: R[]; info: string }> {
  const isSheet = /\.(xlsx|xlsm|xls)$/i.test(file.name);
  const grid = isSheet ? await parseSpreadsheet(await file.arrayBuffer()) : parseDelimited(await file.text());
  return gridToRecords(grid);
}
