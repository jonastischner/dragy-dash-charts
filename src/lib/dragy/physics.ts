import type { Record, Vehicle, Segment, Session, DragPoint } from "./types";

export const G = 9.81;
export const W_TO_PS = 1 / 735.499;

// Air density from T (C), P (hPa), RH (%)
export function airDensity(tempC: number, pHpa: number, rh: number): number {
  const T = tempC + 273.15;
  // Magnus saturation vapor pressure in hPa
  const es = 6.1078 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  const e = (rh / 100) * es; // hPa
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
  const rho = airDensity(session.tempC, session.pressureHpa, session.rh);
  const window = session.manual ? 1 : vehicle.smoothingWindow;
  const vsKmh = smoothCentered(inSeg.map((r) => r.speedKmh), window);
  const times = inSeg.map((r) => r.t);
  const vsMs = vsKmh.map((v) => v / 3.6);
  const a = centralDerivative(vsMs, times);
  const crr = segment.calibration?.crr ?? vehicle.crr;
  const cdA = segment.calibration?.cdA ?? vehicle.cd * vehicle.area;
  const m = vehicle.mass;
  const factor = segment.rpmFactor;
  const out: SegmentSample[] = [];
  for (let i = 0; i < inSeg.length; i++) {
    const v = vsMs[i];
    const pWheel = v * (m * a[i] + m * G * crr + 0.5 * rho * cdA * v * v);
    const rpm = vsKmh[i] * factor;
    const pDragPs = interpDrag(rpm, vehicle.dragCurve);
    const pDragW = pDragPs / W_TO_PS;
    const pEngine = pWheel + pDragW;
    const pWheelPs = pWheel * W_TO_PS;
    const pEnginePs = pEngine * W_TO_PS;
    const tqWheel = rpm >= 50 ? 7023.8 * pWheelPs / rpm : NaN;
    const tqEngine = rpm >= 50 ? 7023.8 * pEnginePs / rpm : NaN;
    out.push({
      t: times[i], vMs: v, a: a[i], rpm,
      pWheelW: pWheel, pDragW, pEngineW: pEngine,
      torqueWheelNm: tqWheel, torqueEngineNm: tqEngine,
      speedKmh: vsKmh[i],
    });
  }
  return out;
}

// Coastdown: fit a_decel = g*Crr + k*v^2 where k = 0.5*rho*CdA/m
// returns crr, cdA, r2
export function coastdownFit(
  session: Session, startT: number, endT: number, mass: number,
): { crr: number; cdA: number; r2: number; n: number } | null {
  const inR = session.records.filter((r) => r.t >= startT && r.t <= endT);
  if (inR.length < 5) return null;
  const rho = airDensity(session.tempC, session.pressureHpa, session.rh);
  const vs = smoothCentered(inR.map((r) => r.speedKmh / 3.6), 5);
  const t = inR.map((r) => r.t);
  const a = centralDerivative(vs, t);
  // a_decel = -a (positive during deceleration)
  const xs: number[] = []; const ys: number[] = [];
  for (let i = 0; i < inR.length; i++) {
    if (a[i] < 0) { xs.push(vs[i] * vs[i]); ys.push(-a[i]); }
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
