import { BigMetricTile } from "./BigMetricTile";
import { formatClock, formatKm } from "@/services/tripEngine";
import type { Waypoint } from "@/types/trip";

export function BestzeitDisplay({
  resetDistance, lifetimeDistance, resetElapsedSeconds, totalElapsedSeconds, liveSpeedKmh, nextWaypoint, onReset,
}: {
  resetDistance: number;
  lifetimeDistance: number;
  resetElapsedSeconds: number;
  totalElapsedSeconds: number;
  liveSpeedKmh: number;
  nextWaypoint: Waypoint | null;
  onReset: () => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <BigMetricTile
        label="Distanz seit Reset"
        value={formatKm(resetDistance)}
        big
        tone="accent"
        onTap={onReset}
        tapHint="Zum Zurücksetzen tippen"
      />
      <BigMetricTile label="Zeit seit Reset" value={formatClock(resetElapsedSeconds)} big tone="accent" />
      <BigMetricTile label="Geschwindigkeit" value={`${liveSpeedKmh.toFixed(0)} km/h`} big />

      <div className="grid grid-cols-2 gap-3 sm:col-span-3">
        <BigMetricTile label="Gesamtdistanz" value={formatKm(lifetimeDistance)} />
        <BigMetricTile label="Gesamtzeit" value={formatClock(totalElapsedSeconds)} />
      </div>

      <div className="text-caption text-muted-foreground sm:col-span-3">
        {nextWaypoint
          ? `Nächster Wegpunkt: ${nextWaypoint.name || "Wegpunkt"} in ${formatKm(Math.max(0, nextWaypoint.distance - resetDistance))}`
          : "Keine weiteren Wegpunkte."}
      </div>
    </div>
  );
}
