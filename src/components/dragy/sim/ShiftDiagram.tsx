import type { Vehicle } from "@/lib/dragy/types";
import { Chart, type Series } from "../Chart";
import { sawtoothPoints, SIM_COLORS, type SimSetup } from "@/lib/dragy/gearSim";

export function ShiftDiagram({ vehicle, setups }: { vehicle: Vehicle; setups: SimSetup[] }) {
  const maxRpm = vehicle.maxRpm && vehicle.maxRpm > 0 ? vehicle.maxRpm : 8000;
  const shiftRpm = vehicle.shiftRpm && vehicle.shiftRpm > 0 ? vehicle.shiftRpm : undefined;

  const series: Series[] = [];
  let kmhMax = 0;
  setups.forEach((s, i) => {
    const { points, kmhMax: km } = sawtoothPoints(s, shiftRpm, maxRpm);
    if (points.length < 2) return;
    if (km > kmhMax) kmhMax = km;
    series.push({ label: s.name, color: SIM_COLORS[i % SIM_COLORS.length], points });
  });

  if (kmhMax > 0) {
    if (shiftRpm) series.push({ label: "Schaltdrehzahl", color: "#f59e0b", points: [{ x: 0, y: shiftRpm }, { x: kmhMax, y: shiftRpm }] });
    if (vehicle.maxRpm && vehicle.maxRpm > 0) series.push({ label: "Maximaldrehzahl", color: "#ef4444", points: [{ x: 0, y: vehicle.maxRpm }, { x: kmhMax, y: vehicle.maxRpm }] });
  }

  return (
    <div>
      <p className="text-caption text-muted-foreground">
        U/min über km/h je Gang. Senkrechte Linien zeigen den Drehzahlabfall beim Schalten (bei gepflegter Schaltdrehzahl);
        waagerechte Linien markieren Schalt- (orange) und Maximaldrehzahl (rot).
      </p>
      <div className="mt-3">
        <Chart
          series={series}
          xLabel="km/h"
          yLabel="U/min"
          xFormat={(v) => v.toFixed(0)}
          yFormat={(v) => v.toFixed(0)}
          height={360}
        />
      </div>
    </div>
  );
}
