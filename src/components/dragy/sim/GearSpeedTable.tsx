import type { Vehicle } from "@/lib/dragy/types";
import { speedTable, SIM_COLORS, type SimSetup } from "@/lib/dragy/gearSim";

export function GearSpeedTable({ vehicle, setups }: { vehicle: Vehicle; setups: SimSetup[] }) {
  const maxRpm = vehicle.maxRpm && vehicle.maxRpm > 0 ? vehicle.maxRpm : 8000;
  const shiftRpm = vehicle.shiftRpm && vehicle.shiftRpm > 0 ? vehicle.shiftRpm : undefined;

  return (
    <div className="space-y-4">
      <p className="text-caption text-muted-foreground">
        km/h je Gang bei Schalt- und Maximaldrehzahl
        {shiftRpm ? ` (Schaltdrehzahl ${shiftRpm} U/min, ` : " ("}
        Maximaldrehzahl {maxRpm} U/min).
      </p>
      {setups.map((s, i) => {
        const rows = speedTable(s, shiftRpm, maxRpm);
        return (
          <div key={s.id} className="rounded-md border border-border bg-elevated p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-3 w-3 flex-none rounded-full" style={{ background: SIM_COLORS[i % SIM_COLORS.length] }} aria-hidden="true" />
              <span className="min-w-0 truncate text-body font-semibold text-foreground">{s.name}</span>
              <span className="ml-auto flex-none text-caption text-muted-foreground">End {s.finalDrive.toFixed(3)} · {s.tireSpec}</span>
            </div>
            <div className="-mx-3 overflow-x-auto px-3">
              <table className="w-full min-w-[420px] text-caption">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">Gang</th>
                    <th className="py-1 pr-2 font-medium">Übers.</th>
                    <th className="py-1 pr-2 font-medium">U/min pro km/h</th>
                    <th className="py-1 pr-2 font-medium">km/h @ Schalt</th>
                    <th className="py-1 pr-2 font-medium">km/h @ Max</th>
                    <th className="py-1 font-medium">U/min danach</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums text-foreground">
                  {rows.map((r) => (
                    <tr key={r.name} className="border-t border-border">
                      <td className="py-1 pr-2">{r.name}</td>
                      <td className="py-1 pr-2">{r.ratio.toFixed(3)}</td>
                      <td className="py-1 pr-2">{r.rpmFactor.toFixed(2)}</td>
                      <td className="py-1 pr-2">{r.kmhAtShift != null ? r.kmhAtShift.toFixed(1) : "—"}</td>
                      <td className="py-1 pr-2">{r.kmhAtMax.toFixed(1)}</td>
                      <td className="py-1">{r.rpmAfterShift != null ? r.rpmAfterShift.toFixed(0) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
