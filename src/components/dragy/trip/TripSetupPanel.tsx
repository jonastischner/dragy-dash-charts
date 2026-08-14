import { Gauge, MapPin, Ruler, Trash2 } from "lucide-react";
import { Button } from "@/components/dragy/ui";
import { TripMasterSettings } from "./TripMasterSettings";
import { formatClock, formatKm } from "@/services/tripEngine";
import type { Trip, Waypoint } from "@/types/trip";

export function TripSetupPanel({
  trip, onCalibrate, onAddWaypoint, onRemoveWaypoint,
  onWarningDistanceChange, onImportWaypoints,
  simOn, simSpeed, onToggleSim, onSimSpeedChange,
}: {
  trip: Trip;
  onCalibrate: () => void;
  onAddWaypoint: () => void;
  onRemoveWaypoint: (id: string) => void;
  onWarningDistanceChange: (m: number) => void;
  onImportWaypoints: (rows: Array<Pick<Waypoint, "distance" | "name" | "note">>) => void;
  simOn: boolean;
  simSpeed: number;
  onToggleSim: () => void;
  onSimSpeedChange: (v: number) => void;
}) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-subtitle text-foreground">Einrichten</h2>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCalibrate} className="min-h-[48px]">
          <Ruler className="h-4 w-4" strokeWidth={2} aria-hidden="true" />Kalibrieren
        </Button>
        <Button variant="secondary" onClick={onAddWaypoint} className="min-h-[48px]">
          <MapPin className="h-4 w-4" strokeWidth={2} aria-hidden="true" />Wegpunkt setzen
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-caption text-muted-foreground sm:grid-cols-4">
        <div>Roh-GPS: <span className="text-foreground">{formatKm(trip.rawGpsMeters)}</span></div>
        <div>Faktor: <span className="text-foreground">{trip.calibrationFactor.toFixed(4)}</span></div>
        <div>Offset: <span className="text-foreground">{trip.manualOffset.toFixed(0)} m</span></div>
        <div>Gesamtstrecke: <span className="text-foreground">{formatKm(trip.totalDistance)}</span></div>
      </div>

      {/* GPS-Simulation */}
      {/* TODO: durch echte GPS-Updates ersetzen (expo-location) */}
      <div className="mt-4 rounded-lg border border-border bg-elevated p-4">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-rally" strokeWidth={2} aria-hidden="true" />
          <h3 className="min-w-0 flex-1 text-body font-semibold text-foreground">GPS-Simulation</h3>
          <Button variant={simOn ? "danger" : "secondary"} disabled={!trip.isRunning} onClick={onToggleSim} className="min-h-[48px]">
            {simOn ? "Simulation stoppen" : "Simulation starten"}
          </Button>
        </div>
        <label className="mt-3 block text-caption text-muted-foreground" htmlFor="sim-speed">
          Simulierte Geschwindigkeit: {(simSpeed * 3.6).toFixed(0)} km/h
        </label>
        <input
          id="sim-speed"
          type="range"
          min={1}
          max={60}
          value={simSpeed}
          onChange={(e) => onSimSpeedChange(Number(e.target.value))}
          className="mt-2 h-11 w-full accent-[color:var(--rally)]"
        />
        {!trip.isRunning && <p className="mt-1 text-caption text-muted-foreground">Trip zuerst starten.</p>}
      </div>

      {/* Wegpunkte */}
      <div className="mt-4">
        <h3 className="mb-2 text-body font-semibold text-foreground">Wegpunkte</h3>
        {trip.waypoints.length === 0 ? (
          <p className="text-caption text-muted-foreground">Noch keine Wegpunkte. Über „Wegpunkt setzen" oder CSV-Import anlegen.</p>
        ) : (
          <ul className="space-y-2">
            {trip.waypoints.map((w) => (
              <li key={w.id} className="flex items-center gap-3 rounded-md border border-border bg-elevated px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body text-foreground">{w.name || "Wegpunkt"} · {formatKm(w.distance)}</div>
                  {w.note && <div className="truncate text-caption text-muted-foreground">{w.note}</div>}
                  {w.splitTime != null && <div className="text-caption text-rally">erreicht bei {formatClock(w.splitTime)}</div>}
                </div>
                <button
                  type="button"
                  aria-label="Wegpunkt löschen"
                  onClick={() => onRemoveWaypoint(w.id)}
                  className="grid h-11 w-11 flex-none place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4">
        <TripMasterSettings
          warningDistance={trip.warningDistance}
          onWarningDistanceChange={onWarningDistanceChange}
          onImportWaypoints={onImportWaypoints}
        />
      </div>
    </div>
  );
}
