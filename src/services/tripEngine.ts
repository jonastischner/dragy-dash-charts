// Reine Logik des Trip-Masters – keine UI, keine Seiteneffekte.
// Arbeitet bereits mit "Metern" als Eingabe und funktioniert deshalb später
// unverändert mit echten GPS-Updates.

import type { RallyeMode, Trip, Waypoint } from "@/types/trip";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function createTrip(mode: RallyeMode, totalDistance: number, name = "Neuer Trip"): Trip {
  return {
    id: uid(),
    name,
    mode,
    totalDistance,
    rawGpsMeters: 0,
    calibrationFactor: 1,
    manualOffset: 0,
    elapsedSeconds: 0,
    isRunning: false,
    waypoints: [],
    warningDistance: 100,
  };
}

export function startTrip(trip: Trip): Trip {
  return { ...trip, isRunning: true };
}

export function stopTrip(trip: Trip): Trip {
  return { ...trip, isRunning: false };
}

/** Setzt Messwerte zurück, behält Kalibrierung und Wegpunkte. */
export function resetTrip(trip: Trip): Trip {
  return {
    ...trip,
    rawGpsMeters: 0,
    manualOffset: 0,
    elapsedSeconds: 0,
    isRunning: false,
    waypoints: trip.waypoints.map((w) => ({ ...w, timestamp: undefined, splitTime: undefined })),
  };
}

/**
 * Fügt gefahrene Meter hinzu und schreibt die Zeit fort.
 * TODO: durch echte GPS-Updates ersetzen (expo-location)
 */
export function addGpsMeters(trip: Trip, meters: number, deltaSeconds = 0): Trip {
  if (!trip.isRunning) return trip;
  return {
    ...trip,
    rawGpsMeters: Math.max(0, trip.rawGpsMeters + meters),
    elapsedSeconds: trip.elapsedSeconds + deltaSeconds,
  };
}

export function getCalibratedDistance(trip: Trip): number {
  return trip.rawGpsMeters * trip.calibrationFactor + trip.manualOffset;
}

export function getAverageSpeed(trip: Trip): number {
  if (trip.elapsedSeconds <= 0) return 0;
  return getCalibratedDistance(trip) / 1000 / (trip.elapsedSeconds / 3600);
}

export function addManualCorrection(trip: Trip, delta: number): Trip {
  return { ...trip, manualOffset: trip.manualOffset + delta };
}

export function setCalibrationFactor(trip: Trip, roadbookMeters: number): Trip {
  if (trip.rawGpsMeters <= 0 || roadbookMeters <= 0) return trip;
  return { ...trip, calibrationFactor: roadbookMeters / trip.rawGpsMeters, manualOffset: 0 };
}

/** Nur Durchschnitts-Rallye: positiv = zu früh, negativ = zu spät. */
export function getTimeDeviation(trip: Trip): number {
  if (trip.mode !== "durchschnitt") return 0;
  const target = trip.targetTimeSeconds ?? targetTimeFromSpeed(trip);
  if (!target) return 0;
  const done = getCalibratedDistance(trip);
  const share = trip.totalDistance > 0 ? Math.min(1, done / trip.totalDistance) : 0;
  return target * share - trip.elapsedSeconds;
}

/** Sollzeit aus Soll-Ø und Gesamtstrecke, falls keine Zeit gepflegt ist. */
export function targetTimeFromSpeed(trip: Trip): number | undefined {
  if (!trip.targetSpeed || trip.targetSpeed <= 0 || trip.totalDistance <= 0) return undefined;
  return (trip.totalDistance / 1000 / trip.targetSpeed) * 3600;
}

export function addWaypoint(trip: Trip, distance: number, name: string, note: string): Trip {
  const wp: Waypoint = { id: uid(), distance, name, note };
  return { ...trip, waypoints: [...trip.waypoints, wp].sort((a, b) => a.distance - b.distance) };
}

export function removeWaypoint(trip: Trip, id: string): Trip {
  return { ...trip, waypoints: trip.waypoints.filter((w) => w.id !== id) };
}

export function setWarningDistance(trip: Trip, meters: number): Trip {
  return { ...trip, warningDistance: Math.max(0, meters) };
}

/** Wegpunkte in Vorwarn-Reichweite, die noch nicht quittiert sind. */
export function checkWaypointWarnings(trip: Trip): Waypoint[] {
  const done = getCalibratedDistance(trip);
  return trip.waypoints.filter(
    (w) => !w.timestamp && w.distance - done <= trip.warningDistance && w.distance - done >= 0,
  );
}

export function acknowledgeWaypoint(trip: Trip, id: string): Trip {
  return {
    ...trip,
    waypoints: trip.waypoints.map((w) =>
      w.id === id ? { ...w, timestamp: Date.now(), splitTime: trip.elapsedSeconds } : w,
    ),
  };
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(2)} km`;
}
