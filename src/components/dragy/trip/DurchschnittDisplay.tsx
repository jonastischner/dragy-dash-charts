import { BigMetricTile } from "./BigMetricTile";
import { formatClock, formatKm } from "@/services/tripEngine";
import type { Waypoint } from "@/types/trip";

export function DurchschnittDisplay({
  elapsedSeconds, resetDistance, lifetimeDistance, totalElapsedSeconds, avg, targetAvg, targetTime, deviation, progress, nextWaypoint, onReset,
}: {
  elapsedSeconds: number;
  resetDistance: number;
  lifetimeDistance: number;
  totalElapsedSeconds: number;
  avg: number;
  targetAvg: number;
  targetTime: number | undefined;
  deviation: number;
  progress: number;
  nextWaypoint: Waypoint | null;
  onReset: () => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="sm:col-span-3">
        <BigMetricTile
          label="Fehler (+ zu früh / − zu spät)"
          value={`${deviation >= 0 ? "+" : "−"}${formatClock(Math.abs(deviation))}`}
          big
          tone={Math.abs(deviation) > 10 ? "warn" : "accent"}
          onTap={onReset}
          tapHint="Zum Zurücksetzen tippen"
        />
      </div>
      <BigMetricTile label="Distanz seit Reset" value={formatKm(resetDistance)} />
      <BigMetricTile label="Soll-Ø" value={`${(targetAvg || 0).toFixed(1)} km/h`} />
      <BigMetricTile label="Ist-Ø" value={`${avg.toFixed(1)} km/h`} />

      <div className="grid grid-cols-2 gap-3 sm:col-span-3">
        <BigMetricTile label="Gesamtdistanz" value={formatKm(lifetimeDistance)} />
        <BigMetricTile label="Gesamtzeit" value={formatClock(totalElapsedSeconds)} />
      </div>

      <div className="sm:col-span-3">
        <div className="mb-1 flex justify-between text-caption text-muted-foreground">
          <span>Soll-Ist-Verlauf</span>
          <span>{(progress * 100).toFixed(0)} %</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-elevated">
          <div className="h-full bg-rally transition-ui" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-caption text-muted-foreground">
          <span>Sollzeit: {targetTime ? formatClock(targetTime) : "–"}</span>
          <span>Laufzeit: {formatClock(elapsedSeconds)}</span>
        </div>
      </div>
      <div className="text-caption text-muted-foreground sm:col-span-3">
        {nextWaypoint
          ? `Nächster Wegpunkt: ${nextWaypoint.name || "Wegpunkt"} in ${formatKm(Math.max(0, nextWaypoint.distance - lifetimeDistance))}`
          : "Keine weiteren Wegpunkte."}
      </div>
    </div>
  );
}
