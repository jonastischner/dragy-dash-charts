import { BigMetricTile } from "./BigMetricTile";
import { formatKm } from "@/services/tripEngine";
import type { Waypoint } from "@/types/trip";

export function BestzeitDisplay({
  distance, liveSpeedKmh, nextWaypoint, onReset,
}: {
  distance: number;
  liveSpeedKmh: number;
  nextWaypoint: Waypoint | null;
  onReset: () => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <BigMetricTile
        label="Gefahrene Distanz"
        value={formatKm(distance)}
        big
        tone="accent"
        onTap={onReset}
        tapHint="Zum Zurücksetzen tippen"
      />
      <BigMetricTile label="Geschwindigkeit" value={`${liveSpeedKmh.toFixed(0)} km/h`} big />
      <div className="text-caption text-muted-foreground sm:col-span-2">
        {nextWaypoint
          ? `Nächster Wegpunkt: ${nextWaypoint.name || "Wegpunkt"} in ${formatKm(Math.max(0, nextWaypoint.distance - distance))}`
          : "Keine weiteren Wegpunkte."}
      </div>
    </div>
  );
}
