import type { Record, Vehicle, Segment, Session, DragPoint, DynoRun } from "./types";

export const G = 9.81;
export const W_TO_PS = 1 / 735.499;
/** Drehmoment aus Leistung und Drehzahl: M[Nm] = 7023.8 * P[PS] / n. */
export const NM_PER_PS_RPM = 7023.8;


// Standard-Umgebungsbedingungen für Sessions ohne eigene Angaben. Sie gehen nur
// in die Luftdichte (Luftwiderstand) ein – eine Normkorrektur findet ohne
// echte Messwerte bewusst NICHT statt (siehe correction.ts).
export const STD_ENV = { tempC: 20, pressureHpa: 1013, rh: 50 } as const;

/** Luftdichte einer Session; fehlende Angaben werden durch STD_ENV ersetzt. */
export function sessionAirDensity(
  s: { tempC?: number; pressureHpa?: number; rh?: number },
): number {
  return airDensity(
    s.tempC ?? STD_ENV.tempC,
    s.pressureHpa ?? STD_ENV.pressureHpa,
    s.rh ?? STD_ENV.rh,
  );
}

// Wasserdampf-Partialdruck in hPa (Magnus). Eigene Funktion, weil auch die
// Normkorrektur nach EWG 80/1269 den Trockendruck p - e braucht (correction.ts).
export function vaporPressureHpa(tempC: number, rh: number): number {
  const es = 6.1078 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  return (rh / 100) * es;
}

// Air density from T (C), P (hPa), RH (%)
export function airDensity(tempC: number, pHpa: number, rh: number): number {
  const T = tempC + 273.15;
  const e = vaporPressureHpa(tempC, rh); // hPa
  const Pd = (pHpa - e) * 100; // Pa
  const Pv = e * 100; // Pa
  return Pd / (287.05 * T) + Pv / (461.495 * T);
}

// Centered moving average, window in samples (odd recommended). window<=1 = no smoothing.
export function smoothCentered(values: number[], window: number): number[] {
  if (window <= 1) return values.slice();
  const half = Math.floor(window / 2);
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0, n = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j >= 0 && j < values.length) { sum += values[j]; n++; }
    }
    out[i] = sum / n;
  }
  return out;
}

export function centralDerivative(values: number[], times: number[]): number[] {
  const n = values.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    if (i === 0) out[i] = (values[1] - values[0]) / (times[1] - times[0]);
    else if (i === n - 1) out[i] = (values[n - 1] - values[n - 2]) / (times[n - 1] - times[n - 2]);
    else out[i] = (values[i + 1] - values[i - 1]) / (times[i + 1] - times[i - 1]);
  }
  return out;
}

// ---- Interpolation & Savitzky-Golay ----------------------------------------

// Linear interpolation of y(x) on a sorted x array.
export function interpLinear(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (n === 0) return NaN;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid; else hi = mid;
  }
  const dx = xs[hi] - xs[lo];
  if (dx === 0) return ys[lo];
  const f = (x - xs[lo]) / dx;
  return ys[lo] + f * (ys[hi] - ys[lo]);
}

// Resample (t, v) onto a uniform time grid with step dt using linear interpolation.
export function resampleUniform(
  times: number[], values: number[], dt: number,
): { times: number[]; values: number[] } {
  const t0 = times[0], t1 = times[times.length - 1];
  const n = Math.max(2, Math.floor((t1 - t0) / dt) + 1);
  const ot: number[] = new Array(n), ov: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dt;
    ot[i] = t;
    ov[i] = interpLinear(times, values, t);
  }
  return { times: ot, values: ov };
}

// Savitzky-Golay filter on uniformly sampled data: local least-squares fit of a
// polynomial of `order` over a window of `window` points. deriv=0 => smoothed
// value, deriv=1 => first derivative (per unit x, i.e. divided by dt).
// Fits are done per point (also near the edges, where the window is clipped),
// so no data points are dropped and the ends stay well-behaved.
export function savitzkyGolay(
  values: number[], window: number, order = 2, deriv: 0 | 1 = 0, dt = 1,
): number[] {
  const n = values.length;
  const out = new Array<number>(n);
  const half = Math.max(1, Math.floor(window / 2));
  const deg = Math.min(order, 3);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    const m = hi - lo + 1;
    if (m < deg + 1) {
      out[i] = deriv === 0 ? values[i] : NaN;
      continue;
    }
    // Normal equations for a polynomial in u = (j - i)
    const size = deg + 1;
    const A: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
    const b: number[] = new Array(size).fill(0);
    for (let j = lo; j <= hi; j++) {
      const u = j - i;
      const pows: number[] = [1];
      for (let k = 1; k <= 2 * deg; k++) pows.push(pows[k - 1] * u);
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) A[r][c] += pows[r + c];
        b[r] += pows[r] * values[j];
      }
    }
    // Gauss elimination with partial pivoting
    for (let c = 0; c < size; c++) {
      let piv = c;
      for (let r = c + 1; r < size; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-12) { piv = c; }
      if (piv !== c) { const tr = A[piv]; A[piv] = A[c]; A[c] = tr; const tb = b[piv]; b[piv] = b[c]; b[c] = tb; }
      const d = A[c][c] || 1e-12;
      for (let r = c + 1; r < size; r++) {
        const f = A[r][c] / d;
        if (!f) continue;
        for (let k = c; k < size; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const coef = new Array<number>(size).fill(0);
    for (let r = size - 1; r >= 0; r--) {
      let s = b[r];
      for (let k = r + 1; k < size; k++) s -= A[r][k] * coef[k];
      coef[r] = s / (A[r][r] || 1e-12);
    }
    // value at u = 0 => coef[0]; derivative at u = 0 => coef[1] / dt
    out[i] = deriv === 0 ? coef[0] : coef[1] / dt;
  }
  return out;
}


export interface SegmentSample {
  t: number;
  vMs: number;
  a: number;
  rpm: number;
  pWheelW: number;
  pDragW: number; // engine drag (schleppleistung) in Watt at rpm
  pEngineW: number;
  torqueWheelNm: number;
  torqueEngineNm: number;
  speedKmh: number;
}

function interpDrag(rpm: number, curve: DragPoint[]): number {
  if (!curve || curve.length === 0) return 0;
  const sorted = [...curve].sort((a, b) => a.rpm - b.rpm);
  if (rpm <= sorted[0].rpm) return sorted[0].ps;
  if (rpm >= sorted[sorted.length - 1].rpm) return sorted[sorted.length - 1].ps;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (rpm >= a.rpm && rpm <= b.rpm) {
      const f = (rpm - a.rpm) / (b.rpm - a.rpm);
      return a.ps + f * (b.ps - a.ps);
    }
  }
  return 0;
}

export function computeSegment(
  session: Session,
  segment: Segment,
  vehicle: Vehicle,
): SegmentSample[] {
  const inSeg = session.records.filter((r) => r.t >= segment.startT && r.t <= segment.endT);
  if (inSeg.length < 3) return [];
  const rho = sessionAirDensity(session);
  const rawT = inSeg.map((r) => r.t);
  const rawV = inSeg.map((r) => r.speedKmh);

  // 1) Auf ein gleichmäßiges Zeitraster interpolieren (Lücken/Jitter der
  //    GPS-Samples werden ausgeglichen, mind. 20 Hz für weiche Kurven).
  const span = rawT[rawT.length - 1] - rawT[0];
  const medDt = span / Math.max(1, rawT.length - 1);
  const dt = Math.min(Math.max(medDt / 2, 0.01), 0.05);
  const grid = resampleUniform(rawT, rawV, dt);
  const times = grid.times;

  // 2) Savitzky-Golay: lokale quadratische Regression liefert geglättete
  //    Geschwindigkeit und die Beschleunigung analytisch aus derselben Fit-
  //    Kurve (kein Rauschverstärken durch nachträgliches Differenzieren).
  const userWin = session.manual ? 1 : Math.max(1, vehicle.smoothingWindow);
  // Fensterbreite in Sekunden aus dem Nutzerwert (bezogen auf Rohabstand),
  // dann in Rasterpunkte umgerechnet – ungerade und mind. 5 Punkte.
  const winSec = Math.max(userWin, 3) * medDt;
  let win = Math.round(winSec / dt);
  if (win % 2 === 0) win += 1;
  win = Math.max(5, Math.min(win, Math.max(5, times.length - 1)));

  const vsKmh = savitzkyGolay(grid.values, win, 2, 0);
  const dvKmhDt = savitzkyGolay(grid.values, win, 2, 1, dt);
  const vsMs = vsKmh.map((v) => v / 3.6);
  // Beschleunigung leicht nachglätten (SG 2. Ordnung, gleiches Fenster).
  const a = savitzkyGolay(dvKmhDt.map((d) => d / 3.6), win, 2, 0);

  const crr = segment.calibration?.crr ?? vehicle.crr;
  const cdA = segment.calibration?.cdA ?? vehicle.cd * vehicle.area;
  const m = session.massOverride && session.massOverride > 0 ? session.massOverride : vehicle.mass;
  const factor = segment.rpmFactor;
  const out: SegmentSample[] = [];
  for (let i = 0; i < times.length; i++) {
    const v = vsMs[i];
    const pWheel = v * (m * a[i] + m * G * crr + 0.5 * rho * cdA * v * v);
    const rpm = vsKmh[i] * factor;
    const pDragPs = interpDrag(rpm, vehicle.dragCurve);
    const pDragW = pDragPs / W_TO_PS;
    const pEngine = pWheel + pDragW;
    const pWheelPs = pWheel * W_TO_PS;
    const pEnginePs = pEngine * W_TO_PS;
    const tqWheel = rpm >= 50 ? NM_PER_PS_RPM * pWheelPs / rpm : NaN;
    const tqEngine = rpm >= 50 ? NM_PER_PS_RPM * pEnginePs / rpm : NaN;
    out.push({
      t: times[i], vMs: v, a: a[i], rpm,
      pWheelW: pWheel, pDragW, pEngineW: pEngine,
      torqueWheelNm: tqWheel, torqueEngineNm: tqEngine,
      speedKmh: vsKmh[i],
    });
  }
  return out;
}

/**
 * Eine gemessene Prüfstandskurve in dieselbe Form bringen, die computeSegment()
 * aus GPS-Daten erzeugt. Damit sehen alle Auswertungen (Diagramme, Spitzenwerte,
 * Vergleich, PDF) eine Prüfstandsmessung wie einen gerechneten Lauf.
 *
 * Was hier NICHT passiert: aus der Kurve einen Geschwindigkeitsverlauf
 * zurückzurechnen. Die Leistung ist der Messwert und bleibt unangetastet.
 */
export function dynoSamples(run: DynoRun, segment: Segment): SegmentSample[] {
  const pts = [...run.points]
    .filter((p) => Number.isFinite(p.rpm) && p.rpm > 0 && Number.isFinite(p.pEnginePs))
    .sort((a, b) => a.rpm - b.rpm);
  if (pts.length === 0) return [];

  const factor = segment.rpmFactor > 0 ? segment.rpmFactor : NaN;
  // Zeitachse rein synthetisch: ein Prüfstandslauf hat keine sinnvolle Zeit,
  // die Auswerter erwarten aber eine monoton steigende Achse innerhalb des
  // Segments.
  const span = Math.max(segment.endT - segment.startT, 0);
  const dt = pts.length > 1 ? span / (pts.length - 1) : 0;

  return pts.map((p, i) => {
    const pDragPs = p.pDragPs ?? (p.pWheelPs != null ? p.pEnginePs - p.pWheelPs : NaN);
    const pWheelPs = p.pWheelPs ?? (p.pDragPs != null ? p.pEnginePs - p.pDragPs : NaN);
    const speedKmh = p.rpm / factor;
    return {
      t: segment.startT + i * dt,
      vMs: speedKmh / 3.6,
      // Konstant positiv: der PDF-Export schneidet einen Lauf am letzten Punkt
      // mit a > 0.15 ab, um die Ausrollphase zu entfernen. Eine
      // Prüfstandskurve hat keine – mit a = 0 würde sie abgeschnitten.
      a: 1,
      rpm: p.rpm,
      pWheelW: pWheelPs / W_TO_PS,
      pDragW: pDragPs / W_TO_PS,
      pEngineW: p.pEnginePs / W_TO_PS,
      torqueWheelNm: NM_PER_PS_RPM * pWheelPs / p.rpm,
      torqueEngineNm: NM_PER_PS_RPM * p.pEnginePs / p.rpm,
      speedKmh,
    };
  });
}

/**
 * Auswertung eines Laufs – egal ob aus GPS-Daten gerechnet oder auf dem
 * Prüfstand gemessen. Alle Verbraucher sollen hierüber gehen, nicht direkt
 * über computeSegment().
 */
export function segmentSamples(
  session: Session,
  segment: Segment,
  vehicle: Vehicle,
): SegmentSample[] {
  return segment.dyno ? dynoSamples(segment.dyno, segment) : computeSegment(session, segment, vehicle);
}

// Coastdown: fit a_decel = g*Crr + k*v^2 where k = 0.5*rho*CdA/m
// returns crr, cdA, r2
export function coastdownFit(
  session: Session, startT: number, endT: number, mass: number,
): { crr: number; cdA: number; r2: number; n: number } | null {
  const inR = session.records.filter((r) => r.t >= startT && r.t <= endT);
  if (inR.length < 5) return null;
  const rho = sessionAirDensity(session);
  const rawT = inR.map((r) => r.t);
  const rawV = inR.map((r) => r.speedKmh / 3.6);
  const medDt = (rawT[rawT.length - 1] - rawT[0]) / Math.max(1, rawT.length - 1);
  const dt = Math.min(Math.max(medDt / 2, 0.01), 0.05);
  const grid = resampleUniform(rawT, rawV, dt);
  let win = Math.round((7 * medDt) / dt);
  if (win % 2 === 0) win += 1;
  win = Math.max(5, Math.min(win, Math.max(5, grid.times.length - 1)));
  const vs = savitzkyGolay(grid.values, win, 2, 0);
  const a = savitzkyGolay(grid.values, win, 2, 1, dt);
  // a_decel = -a (positive during deceleration)
  const xs: number[] = []; const ys: number[] = [];
  for (let i = 0; i < vs.length; i++) {
    if (Number.isFinite(a[i]) && a[i] < 0) { xs.push(vs[i] * vs[i]); ys.push(-a[i]); }
  }
  if (xs.length < 5) return null;

  // linear regression y = b0 + b1*x
  const n = xs.length;
  const sx = xs.reduce((s, v) => s + v, 0);
  const sy = ys.reduce((s, v) => s + v, 0);
  const sxy = xs.reduce((s, v, i) => s + v * ys[i], 0);
  const sxx = xs.reduce((s, v) => s + v * v, 0);
  const b1 = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const b0 = (sy - b1 * sx) / n;
  const meanY = sy / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yhat = b0 + b1 * xs[i];
    ssRes += (ys[i] - yhat) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const crr = b0 / G;
  const cdA = (2 * mass * b1) / rho;
  return { crr, cdA, r2, n };
}

// Auto-detect the best coastdown window in a session: longest contiguous
// deceleration with a steady negative acceleration and meaningful speed drop.
export function autoDetectCoastdown(session: Session): { startT: number; endT: number } | null {
  const recs = session.records;
  if (recs.length < 10) return null;
  const vs = smoothCentered(recs.map((r) => r.speedKmh / 3.6), 5);
  const ts = recs.map((r) => r.t);
  const a = centralDerivative(vs, ts);
  let best: { s: number; e: number; score: number } | null = null;
  let i = 0;
  while (i < recs.length) {
    if (a[i] < -0.15 && vs[i] > 5) {
      let j = i;
      while (j < recs.length - 1 && a[j + 1] < -0.05) j++;
      const dv = vs[i] - vs[j];
      const dt = ts[j] - ts[i];
      if (dv >= 20 / 3.6 && dt >= 3) {
        const score = dv * dt;
        if (!best || score > best.score) best = { s: i, e: j, score };
      }
      i = j + 1;
    } else i++;
  }
  if (!best) return null;
  return { startT: ts[best.s], endT: ts[best.e] };
}



// Auto-detect segments: search backward from target speed to lowest point of the preceding rise.
export function autoDetectSegments(
  records: Record[], startKmh: number, targetKmh: number, minRiseKmh = 30,
): Array<{ startT: number; endT: number }> {
  const out: Array<{ startT: number; endT: number }> = [];
  if (records.length < 5) return out;
  let i = records.length - 1;
  const used = new Array(records.length).fill(false);
  while (i > 0) {
    // find next point at or above target going backward
    while (i > 0 && (records[i].speedKmh < targetKmh || used[i])) i--;
    if (i <= 0) break;
    const endIdx = i;
    // walk backward while speed generally decreases
    let j = endIdx;
    let minIdx = endIdx;
    let minV = records[endIdx].speedKmh;
    while (j > 0) {
      const v = records[j].speedKmh;
      if (v < minV) { minV = v; minIdx = j; }
      // stop if we start rising again significantly from a local min
      if (records[j].speedKmh - minV > 5) break;
      if (records[j].speedKmh <= startKmh) { minIdx = j; break; }
      j--;
    }
    const rise = records[endIdx].speedKmh - records[minIdx].speedKmh;
    if (rise >= minRiseKmh) {
      out.unshift({ startT: records[minIdx].t, endT: records[endIdx].t });
      for (let k = minIdx; k <= endIdx; k++) used[k] = true;
    }
    i = minIdx - 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Beschleunigungs-Auswertung (Kategorie "accel"): Split-Zeiten und 1/4 Meile.
// Arbeitet direkt auf den GPS-Records, unabhängig von Drehzahl/Leistung.
// ---------------------------------------------------------------------------

const QUARTER_MILE_M = 402.336;

/**
 * Die Split-Paare der App – eine Quelle für Session-Ansicht, Bestenliste und
 * Vergleich. Alle drei zeigten dieselben Werte aus je eigener Konstante.
 */
export const ACCEL_SPLITS: Array<[number, number]> = [[0, 100], [100, 200], [60, 130], [80, 120]];

/**
 * Erster Zeitpunkt (s), an dem der Lauf die Zielgeschwindigkeit von unten
 * durchfährt – linear zwischen den Abtastpunkten interpoliert. null, wenn die
 * Geschwindigkeit im Lauf nie erreicht wird.
 */
export function crossingTime(
  records: Record[],
  startT: number,
  endT: number,
  targetKmh: number,
): number | null {
  const rec = records.filter((r) => r.t >= startT && r.t <= endT);
  return crossIn(rec, targetKmh, 1)?.t ?? null;
}

/** Interne Suche im bereits zugeschnittenen Ausschnitt; gibt auch den Index für Folgesuchen zurück. */
function crossIn(rec: Record[], target: number, fromIdx: number): { t: number; idx: number } | null {
  for (let i = Math.max(1, fromIdx); i < rec.length; i++) {
    const a = rec[i - 1], b = rec[i];
    if (a.speedKmh <= target && b.speedKmh >= target) {
      const dv = b.speedKmh - a.speedKmh;
      const t = dv === 0 ? b.t : a.t + ((target - a.speedKmh) / dv) * (b.t - a.t);
      return { t, idx: i };
    }
  }
  return null;
}

/** Zeit (s) zwischen zwei Geschwindigkeiten innerhalb eines Laufs, linear interpoliert. */
export function splitTime(
  records: Record[],
  startT: number,
  endT: number,
  fromKmh: number,
  toKmh: number,
): number | null {
  const rec = records.filter((r) => r.t >= startT && r.t <= endT);
  if (rec.length < 2) return null;
  const a = crossIn(rec, fromKmh, 1);
  if (!a) return null;
  const b = crossIn(rec, toKmh, a.idx);
  if (!b) return null;
  const dt = b.t - a.t;
  return dt > 0 ? dt : null;
}

/** Distanz (m) und Endgeschwindigkeit (km/h) für eine Zieldistanz, ab Startpunkt des Laufs. */
export function distanceRun(
  records: Record[],
  startT: number,
  endT: number,
  targetM: number = QUARTER_MILE_M,
): { seconds: number; trapKmh: number } | null {
  const rec = records.filter((r) => r.t >= startT && r.t <= endT);
  if (rec.length < 2) return null;
  let dist = 0;
  for (let i = 1; i < rec.length; i++) {
    const a = rec[i - 1], b = rec[i];
    const dt = b.t - a.t;
    if (!(dt > 0)) continue;
    const va = a.speedKmh / 3.6, vb = b.speedKmh / 3.6;
    const seg = ((va + vb) / 2) * dt;
    if (dist + seg >= targetM) {
      const need = targetM - dist;
      const frac = seg > 0 ? need / seg : 0;
      return {
        seconds: a.t - rec[0].t + frac * dt,
        trapKmh: a.speedKmh + frac * (b.speedKmh - a.speedKmh),
      };
    }
    dist += seg;
  }
  return null;
}

/** Gesamt zurückgelegte Distanz (m) eines Laufs. */
export function runDistance(records: Record[], startT: number, endT: number): number {
  const rec = records.filter((r) => r.t >= startT && r.t <= endT);
  let dist = 0;
  for (let i = 1; i < rec.length; i++) {
    const a = rec[i - 1], b = rec[i];
    const dt = b.t - a.t;
    if (!(dt > 0)) continue;
    dist += ((a.speedKmh / 3.6 + b.speedKmh / 3.6) / 2) * dt;
  }
  return dist;
}
