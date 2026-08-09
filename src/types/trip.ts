// Typen für den Rallye-Trip-Master (Wegstreckenzähler).

export type RallyeMode = "bestzeit" | "durchschnitt";

export interface Waypoint {
  id: string;
  distance: number;      // Meter (Roadbook-Distanz)
  name: string;
  note: string;
  timestamp?: number;    // gesetzt, sobald der Wegpunkt erreicht/quittiert wurde
  splitTime?: number;    // Sekunden seit Trip-Start beim Erreichen
}

export interface Trip {
  id: string;
  name: string;
  mode: RallyeMode;
  totalDistance: number;      // Meter Gesamtstrecke (Soll)
  rawGpsMeters: number;       // rohe GPS-Meter
  calibrationFactor: number;  // Korrekturfaktor auf GPS-Meter
  manualOffset: number;       // manuelle Korrektur in Meter
  targetSpeed?: number;       // km/h Soll-Ø (Durchschnitts-Rallye)
  targetTimeSeconds?: number; // Sollzeit in Sekunden
  elapsedSeconds: number;
  isRunning: boolean;
  waypoints: Waypoint[];
  warningDistance: number;    // Vorwarn-Distanz in Meter
}
