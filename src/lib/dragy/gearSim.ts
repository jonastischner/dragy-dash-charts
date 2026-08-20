// Rechenhilfen für den Getriebe-Simulator: Setups (auch virtuelle) auflösen,
// Sägezahn-Kurven, Tempo-Tabellen und eine Beschleunigungs-Prognose aus einer
// gemessenen Radleistungskurve.

import type { GearRatio, Segment, Session, Vehicle } from "./types";
import { computeRpmFactor, normalizeDrive } from "./gear";
import { airDensity, computeSegment, interpLinear, W_TO_PS } from "./physics";
import { sessionModule } from "./modules";

/** Ein simulierbares Setup – kann gespeichert oder nur temporär („Testsetup“) sein. */
export interface SimSetup {
  id: string;
  name: string;
  gears: GearRatio[];
  finalDrive: number;
  tireSpec: string;
  virtual?: boolean;
}

export interface SimGear {
  gear: GearRatio;
  rpmFactor: number; // U/min pro km/h
}

export const SIM_COLORS = ["#38bdf8", "#f472b6", "#a3e635", "#fbbf24", "#c084fc", "#f97316", "#22d3ee"];

/** Alle gespeicherten Setups des Fahrzeugs als SimSetup auflösen. */
export function simSetupsFromVehicle(vehicle: Vehicle | null | undefined): SimSetup[] {
  if (!vehicle) return [];
  const { gearboxDefs, finalDrives, tires, setups } = normalizeDrive(vehicle);
  const out: SimSetup[] = [];
  for (const s of setups) {
    const gb = gearboxDefs.find((g) => g.id === s.gearboxId);
    const fd = finalDrives.find((f) => f.id === s.finalDriveId);
    if (!gb || !fd) continue;
    const tire = tires.find((t) => t.id === s.tireId);
    const tireSpec = tire?.spec ?? gb.tireSpec ?? "";
    if (!tireSpec || gb.gears.length === 0) continue;
    out.push({ id: s.id, name: s.name, gears: gb.gears, finalDrive: fd.ratio, tireSpec });
  }
  return out;
}

/** Gänge eines Setups in Fahr-Reihenfolge (1. Gang = größter rpmFactor). */
export function simGears(setup: SimSetup): SimGear[] {
  const list: SimGear[] = [];
  for (const g of setup.gears) {
    const f = computeRpmFactor(g.ratio, setup.finalDrive, setup.tireSpec);
    if (f == null || !Number.isFinite(f) || f <= 0) continue;
    list.push({ gear: g, rpmFactor: +f.toFixed(3) });
  }
  return list.sort((a, b) => b.rpmFactor - a.rpmFactor);
}

/**
 * Sägezahn-Kurve: pro Gang Anstieg 0 → Schaltdrehzahl (letzter Gang: Maximal-
 * drehzahl), danach senkrechter Drehzahlabfall in den nächsten Gang.
 */
export function sawtoothPoints(
  setup: SimSetup,
  shiftRpm: number | undefined,
  maxRpm: number,
): { points: Array<{ x: number; y: number }>; kmhMax: number } {
  const gears = simGears(setup);
  const points: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  let kmhMax = 0;
  gears.forEach((r, gi) => {
    const isLast = gi === gears.length - 1;
    const rpmTop = isLast ? maxRpm : (shiftRpm ?? maxRpm);
    const kmhTop = rpmTop / r.rpmFactor;
    if (kmhTop > kmhMax) kmhMax = kmhTop;
    points.push({ x: kmhTop, y: rpmTop });
    const next = gears[gi + 1];
    if (next && !isLast) points.push({ x: kmhTop, y: rpmTop * (next.rpmFactor / r.rpmFactor) });
  });
  return { points, kmhMax };
}

export interface SpeedRow {
  name: string;
  ratio: number;
  rpmFactor: number;
  kmhAtShift: number | null;
  kmhAtMax: number;
  rpmAfterShift: number | null;
}

/** Tempo-/Drehzahl-Tabelle für ein Setup. */
export function speedTable(setup: SimSetup, shiftRpm: number | undefined, maxRpm: number): SpeedRow[] {
  const gears = simGears(setup);
  return gears.map((r, i) => {
    const next = gears[i + 1];
    const top = shiftRpm ?? maxRpm;
    return {
      name: r.gear.name,
      ratio: r.gear.ratio,
      rpmFactor: r.rpmFactor,
      kmhAtShift: shiftRpm ? shiftRpm / r.rpmFactor : null,
      kmhAtMax: maxRpm / r.rpmFactor,
      rpmAfterShift: next ? top * (next.rpmFactor / r.rpmFactor) : null,
    };
  });
}

/** Gemessene Radleistung über Drehzahl (aus dem stärksten Leistungs-Lauf). */
export interface PowerCurve {
  sessionName: string;
  segmentName: string;
  peakPs: number;
  rpm: number[];
  pWheelW: number[];
  rho: number;
}

/**
 * Bester Leistungs-Lauf des Fahrzeugs → Radleistung, in 100-U/min-Bins
 * gemittelt. null, wenn es keine auswertbare Messung gibt.
 */
// BEWUSST OHNE NORMKORREKTUR (correction.ts): Diese Kurve speist die
// Beschleunigungsprognose. Sie muss die *gemessene* Leistung abbilden, damit die
// Simulation die *tatsächliche* Beschleunigung vorhersagt. Mit einer auf
// Referenzbedingungen normierten Kurve würde sie die Beschleunigung unter
// Normbedingungen prognostizieren – eine Vorhersage, die zur Realität nicht passt.
export function bestPowerCurve(
  vehicle: Vehicle,
  sessions: Session[],
  segments: Segment[],
): PowerCurve | null {
  let best: PowerCurve | null = null;
  for (const s of sessions) {
    if (s.vehicleId !== vehicle.id || sessionModule(s) !== "power") continue;
    for (const g of segments.filter((x) => x.sessionId === s.id)) {
      const samples = computeSegment(s, g, vehicle);
      if (samples.length < 5) continue;
      const bins = new Map<number, { sum: number; n: number }>();
      let peakPs = 0;
      for (const smp of samples) {
        if (!Number.isFinite(smp.rpm) || smp.rpm < 500 || !Number.isFinite(smp.pWheelW)) continue;
        const ps = smp.pEngineW * W_TO_PS;
        if (Number.isFinite(ps) && ps > peakPs) peakPs = ps;
        const key = Math.round(smp.rpm / 100) * 100;
        const b = bins.get(key) ?? { sum: 0, n: 0 };
        b.sum += smp.pWheelW; b.n += 1;
        bins.set(key, b);
      }
      if (bins.size < 3) continue;
      const keys = [...bins.keys()].sort((a, b) => a - b);
      const curve: PowerCurve = {
        sessionName: s.name,
        segmentName: g.name,
        peakPs,
        rpm: keys,
        pWheelW: keys.map((k) => bins.get(k)!.sum / bins.get(k)!.n),
        rho: airDensity(s.tempC, s.pressureHpa, s.rh),
      };
      if (!best || curve.peakPs > best.peakPs) best = curve;
    }
  }
  return best;
}

export interface AccelResult {
  setupId: string;
  setupName: string;
  points: Array<{ x: number; y: number }>; // x = km/h, y = s
  splits: { t100: number | null; t200: number | null; t100_200: number | null };
  vMaxKmh: number;
}

const G = 9.81;

/**
 * Beschleunigungs-Prognose: integriert die gemessene Radleistung über die
 * Übersetzungen des Setups. Fahrwiderstände aus dem Fahrzeug, Schaltvorgänge
 * als kurze Pause ohne Antrieb. Näherung – keine Prüfstands-Genauigkeit.
 */
export function simulateAccel(
  vehicle: Vehicle,
  curve: PowerCurve,
  setup: SimSetup,
  opts?: { shiftTimeS?: number; gripMu?: number; massKg?: number },
): AccelResult | null {
  const gears = simGears(setup);
  if (gears.length === 0) return null;
  const shiftTime = opts?.shiftTimeS ?? 0.35;
  const mu = opts?.gripMu ?? 1.0;
  const m = opts?.massKg && opts.massKg > 0 ? opts.massKg : vehicle.mass;
  const cdA = vehicle.cd * vehicle.area;
  const crr = vehicle.crr;
  const maxRpm = vehicle.maxRpm && vehicle.maxRpm > 0 ? vehicle.maxRpm : Math.max(...curve.rpm);
  const shiftRpm = vehicle.shiftRpm && vehicle.shiftRpm > 0 ? Math.min(vehicle.shiftRpm, maxRpm) : maxRpm;
  const rpmMin = curve.rpm[0];

  const dt = 0.02;
  let t = 0;
  let v = 0; // m/s
  let gi = 0;
  const points: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  let shiftLeft = 0;

  for (let step = 0; step < 60000; step++) {
    const vKmh = v * 3.6;
    const g = gears[gi];
    const rpm = Math.max(rpmMin, vKmh * g.rpmFactor);
    const isLast = gi === gears.length - 1;

    let a: number;
    if (shiftLeft > 0) {
      shiftLeft -= dt;
      a = -(G * crr + (0.5 * curve.rho * cdA * v * v) / m);
    } else {
      if (!isLast && rpm >= shiftRpm) { shiftLeft = shiftTime; continue; }
      const pWheel = Math.max(0, interpLinear(curve.rpm, curve.pWheelW, Math.min(rpm, maxRpm)));
      const fMaxGrip = mu * m * G;
      const fDrive = v > 0.5 ? Math.min(pWheel / v, fMaxGrip) : fMaxGrip;
      const fRes = m * G * crr + 0.5 * curve.rho * cdA * v * v;
      a = (fDrive - fRes) / m;
    }

    v = Math.max(0, v + a * dt);
    t += dt;
    if (t - points[points.length - 1].y >= 0.05 || v * 3.6 - points[points.length - 1].x >= 1) {
      points.push({ x: v * 3.6, y: t });
    }
    if (isLast && (rpm >= maxRpm || (a < 0.02 && shiftLeft <= 0))) break;
    if (t > 120) break;
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const at = (kmh: number): number | null => {
    if (xs[xs.length - 1] < kmh) return null;
    return +interpLinear(xs, ys, kmh).toFixed(2);
  };
  const t100 = at(100);
  const t200 = at(200);
  return {
    setupId: setup.id,
    setupName: setup.name,
    points,
    splits: {
      t100,
      t200,
      t100_200: t100 != null && t200 != null ? +(t200 - t100).toFixed(2) : null,
    },
    vMaxKmh: xs[xs.length - 1],
  };
}
