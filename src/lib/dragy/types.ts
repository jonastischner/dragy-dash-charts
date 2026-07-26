export interface DragPoint { rpm: number; ps: number }

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
}

export interface AppState {
  vehicles: Vehicle[];
  sessions: Session[];
  segments: Segment[];
  activeVehicleId: string | null;
}
