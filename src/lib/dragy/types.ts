export interface DragPoint { rpm: number; ps: number }

export interface GearPreset {
  id: string;
  name: string;           // z.B. "3. Gang" oder "Serienübersetzung"
  gearRatio: number;      // Getriebeübersetzung des Gangs (z.B. 1.32)
  finalDrive: number;     // Hinterachs-/Endübersetzung (z.B. 3.46)
  tireSpec: string;       // z.B. "225/45R17"
  rpmFactor: number;      // berechnet: U/min pro km/h
}

export interface GearRatio {
  id: string;
  name: string;   // z.B. "1. Gang"
  ratio: number;  // Getriebeübersetzung dieses Gangs
}

export interface Gearbox {
  id?: string;          // optionale ID (für Multi-Gearbox-Setups)
  name?: string;        // optionaler Anzeigename, z.B. "Serie" / "Kurz"
  finalDrive: number;   // Endübersetzung (Legacy: kombiniert)
  tireSpec: string;     // z.B. "225/45R17"
  gears: GearRatio[];   // Liste der Gänge mit Übersetzung
}

// Entkoppelte Bausteine: Getriebe (nur Gänge + Reifen), Endübersetzung separat,
// Setup als Kombination beider.
export interface GearboxDef {
  id: string;
  name: string;
  tireSpec?: string; // Legacy: früher am Getriebe gepflegt, jetzt am Setup via tireId
  gears: GearRatio[];
}
export interface FinalDriveDef {
  id: string;
  name: string;
  ratio: number;
}
export interface TireDef {
  id: string;
  name: string;
  spec: string; // z.B. "225/45R17"
}
export interface DriveSetup {
  id: string;
  name: string;
  gearboxId: string;
  finalDriveId: string;
  tireId?: string; // Verweis auf Vehicle.tires[]
}

export interface Vehicle {
  id: string;
  name: string;
  mass: number;         // kg incl. driver/tank
  cd: number;
  area: number;         // m²
  crr: number;
  calibrated: boolean;
  smoothingWindow: number;
  rpmFactorDefault: number; // rpm per km/h
  rpmMatch: { maxRpm: number; maxKmh: number };
  dragCurve: DragPoint[]; // schleppleistung rpm->ps
  gearPresets?: GearPreset[]; // optionale Getriebe-/Gang-Presets (Legacy)
  gearbox?: Gearbox; // Legacy: einzelne Getriebedefinition (wird beim Öffnen in gearboxes migriert)
  gearboxes?: Gearbox[]; // Legacy: mehrere Getriebe mit Endübersetzung inline
  defaultGearboxId?: string; // Legacy: welches Getriebe war Standard
  // Neue, entkoppelte Antriebs-Bausteine:
  gearboxDefs?: GearboxDef[];
  finalDrives?: FinalDriveDef[];
  tires?: TireDef[];
  setups?: DriveSetup[];
  defaultSetupId?: string;
  shiftRpm?: number;   // empfohlene Schaltdrehzahl
  maxRpm?: number;     // Maximaldrehzahl (Begrenzer)
  imageDataUrl?: string; // optional Fahrzeugbild als data:URL (lokal + Cloud-Sync via JSONB)
  updatedAt?: number;
}

export interface Record { t: number; speedKmh: number; heightM: number }

export interface ManualRow { speedKmh: number; t: number | null }

/** Kategorie eines Laufs – steuert Auswertung und Anzeige. */
export type RunCategory = "power" | "accel" | "coastdown" | "stage" | "lap";

/** Modul/Typ einer Session. */
export type SessionKind = "performance" | "rally" | "circuit";


export interface Session {
  id: string;
  vehicleId: string;
  name: string;
  records: Record[];
  tempC: number;
  pressureHpa: number;
  rh: number;
  manual: boolean;
  manualRows?: ManualRow[];
  createdAt: number;
  notes?: string;
  massOverride?: number; // kg, optional per-session Abweichung vom Fahrzeug-Standardgewicht
  updatedAt?: number;
}

export interface Segment {
  id: string;
  sessionId: string;
  name: string;
  startT: number;
  endT: number;
  rpmFactor: number;
  gearPresetId?: string; // optionaler Verweis auf ein Fahrzeug-Preset (rpmFactor bleibt der resolvierte Wert)
  color: string;
  visible: boolean;
  calibration?: { crr: number; cdA: number };
  notes?: string;
  updatedAt?: number;
}


export interface AppState {
  vehicles: Vehicle[];
  sessions: Session[];
  segments: Segment[];
  activeVehicleId: string | null;
}
