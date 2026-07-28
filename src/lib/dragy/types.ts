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
  finalDrive: number;   // Endübersetzung
  tireSpec: string;     // z.B. "225/45R17"
  gears: GearRatio[];   // Liste der Gänge mit Übersetzung
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
  gearbox?: Gearbox; // strukturierte Getriebedefinition mit Gängen
  imageDataUrl?: string; // optional Fahrzeugbild als data:URL (lokal + Cloud-Sync via JSONB)
  updatedAt?: number;
}

export interface Record { t: number; speedKmh: number; heightM: number }

export interface ManualRow { speedKmh: number; t: number | null }

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
