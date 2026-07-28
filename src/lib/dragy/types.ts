export interface DragPoint { rpm: number; ps: number }

export interface GearPreset {
  id: string;
  name: string;           // z.B. "3. Gang" oder "Serienübersetzung"
  gearRatio: number;      // Getriebeübersetzung des Gangs (z.B. 1.32)
  finalDrive: number;     // Hinterachs-/Endübersetzung (z.B. 3.46)
  tireSpec: string;       // z.B. "225/45R17"
  rpmFactor: number;      // berechnet: U/min pro km/h
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
  gearPresets?: GearPreset[]; // optionale Getriebe-/Gang-Presets
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
