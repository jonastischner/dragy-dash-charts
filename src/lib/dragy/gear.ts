// Utilities für Getriebe-Presets: Reifen-Parsing und RPM-Faktor-Berechnung.

// Parst gängige Reifenbezeichnungen wie "225/45R17" oder "225/45 ZR 17"
// und liefert den Abrollumfang in Metern. Fällt auf null zurück, wenn kein
// Match möglich ist.
export function tireCircumferenceM(spec: string): number | null {
  if (!spec) return null;
  const m = spec.replace(/\s+/g, "").match(/^(\d{3})\/(\d{2,3})[A-Z]*R?(\d{2})$/i);
  if (!m) return null;
  const width = parseInt(m[1], 10);       // mm
  const aspect = parseInt(m[2], 10);      // %
  const rimInch = parseInt(m[3], 10);     // Zoll
  const rimMm = rimInch * 25.4;
  const sidewallMm = (width * aspect) / 100;
  const diameterMm = rimMm + 2 * sidewallMm;
  // Etwas Umfangs-Reduktion durch dynamischen Rollradius (~97%).
  const dynamic = 0.97;
  return (Math.PI * diameterMm * dynamic) / 1000; // m
}

// rpm pro km/h aus Getriebeübersetzung, Endübersetzung und Reifen.
// v_kmh -> v_m/s = v/3.6; wheelRpm = 60*v/(3.6*U); engineRpm = wheelRpm * gearRatio * finalDrive
// => rpm/kmh = (60 * gearRatio * finalDrive) / (3.6 * U_m)
export function computeRpmFactor(
  gearRatio: number,
  finalDrive: number,
  tireSpec: string,
): number | null {
  const U = tireCircumferenceM(tireSpec);
  if (!U || !Number.isFinite(gearRatio) || !Number.isFinite(finalDrive) || gearRatio <= 0 || finalDrive <= 0) return null;
  return (60 * gearRatio * finalDrive) / (3.6 * U);
}

import type { Vehicle, DriveSetup, GearboxDef, FinalDriveDef, GearRatio } from "./types";

export interface ResolvedGear {
  setupId: string;
  setupName: string;
  gearboxId: string;
  finalDriveId: string;
  gear: GearRatio;
  rpmFactor: number; // U/min pro km/h
  tireSpec: string;
  finalDrive: number;
}

// Migriert Legacy-`gearboxes[]` (Getriebe mit finalDrive inline) in getrennte
// GearboxDefs/FinalDrives/Setups. Reine Lese-Migration: verändert das
// Vehicle-Objekt nicht in der DB, sondern liefert eine normalisierte Sicht.
export function normalizeDrive(vehicle: Vehicle | null | undefined): {
  gearboxDefs: GearboxDef[];
  finalDrives: FinalDriveDef[];
  setups: DriveSetup[];
  defaultSetupId?: string;
} {
  if (!vehicle) return { gearboxDefs: [], finalDrives: [], setups: [] };
  const gearboxDefs = [...(vehicle.gearboxDefs ?? [])];
  const finalDrives = [...(vehicle.finalDrives ?? [])];
  const setups = [...(vehicle.setups ?? [])];
  let defaultSetupId = vehicle.defaultSetupId;

  const legacyList = vehicle.gearboxes ?? (vehicle.gearbox ? [{ id: "legacy", name: "Getriebe", ...vehicle.gearbox }] : []);
  const alreadyMigrated = setups.length > 0 || gearboxDefs.length > 0;
  if (!alreadyMigrated && legacyList.length > 0) {
    for (const gb of legacyList) {
      const gbId = gb.id ?? `gb-${gearboxDefs.length + 1}`;
      gearboxDefs.push({ id: gbId, name: gb.name || "Getriebe", tireSpec: gb.tireSpec, gears: gb.gears });
      // Endübersetzung deduplizieren (gleiche Ratio -> gleicher FinalDrive-Eintrag)
      let fd = finalDrives.find((f) => Math.abs(f.ratio - gb.finalDrive) < 1e-6);
      if (!fd) {
        fd = { id: `fd-${finalDrives.length + 1}`, name: gb.finalDrive.toFixed(3), ratio: gb.finalDrive };
        finalDrives.push(fd);
      }
      const setup: DriveSetup = {
        id: `setup-${setups.length + 1}`,
        name: `${gb.name || "Getriebe"} + ${fd.name}`,
        gearboxId: gbId,
        finalDriveId: fd.id,
      };
      setups.push(setup);
      if (!defaultSetupId && vehicle.defaultGearboxId === gb.id) defaultSetupId = setup.id;
    }
    if (!defaultSetupId) defaultSetupId = setups[0]?.id;
  }
  return { gearboxDefs, finalDrives, setups, defaultSetupId };
}

// Alle wählbaren Gänge quer über alle Setups auflösen (für Dropdowns/Diagramme).
export function resolveAllGears(vehicle: Vehicle | null | undefined): ResolvedGear[] {
  const { gearboxDefs, finalDrives, setups } = normalizeDrive(vehicle);
  const out: ResolvedGear[] = [];
  for (const setup of setups) {
    const gb = gearboxDefs.find((g) => g.id === setup.gearboxId);
    const fd = finalDrives.find((f) => f.id === setup.finalDriveId);
    if (!gb || !fd) continue;
    for (const g of gb.gears) {
      const f = computeRpmFactor(g.ratio, fd.ratio, gb.tireSpec);
      if (f == null || !Number.isFinite(f) || f <= 0) continue;
      out.push({
        setupId: setup.id, setupName: setup.name,
        gearboxId: gb.id, finalDriveId: fd.id,
        gear: g, rpmFactor: +f.toFixed(3),
        tireSpec: gb.tireSpec, finalDrive: fd.ratio,
      });
    }
  }
  return out;
}

