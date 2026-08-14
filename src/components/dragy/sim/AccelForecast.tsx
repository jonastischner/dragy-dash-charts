import { useMemo } from "react";
import type { Segment, Session, Vehicle } from "@/lib/dragy/types";
import { Chart, type Series } from "../Chart";
import { Button, Note } from "../ui";
import { bestPowerCurve, simulateAccel, SIM_COLORS, type SimSetup } from "@/lib/dragy/gearSim";

function fmt(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(2)} s`;
}
function delta(v: number | null, ref: number | null): string {
  if (v == null || ref == null) return "";
  const d = v - ref;
  if (Math.abs(d) < 0.005) return "±0,00";
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}`;
}

export function AccelForecast({ vehicle, sessions, segments, setups, referenceSetupId, onOpenPower }: {
  vehicle: Vehicle;
  sessions: Session[];
  segments: Segment[];
  setups: SimSetup[];
  referenceSetupId?: string;
  onOpenPower?: () => void;
}) {
  const curve = useMemo(() => bestPowerCurve(vehicle, sessions, segments), [vehicle, sessions, segments]);
  const results = useMemo(
    () => (curve ? setups.map((s) => simulateAccel(vehicle, curve, s)).filter((r) => r != null) : []),
    [curve, setups, vehicle],
  );

  if (!curve) {
    return (
      <div>
        <Note>
          Für die Prognose wird eine gemessene Leistungskurve gebraucht. Nimm im Modul „Leistung &amp; Drehmoment“ mindestens
          einen Lauf für dieses Fahrzeug auf.
        </Note>
        {onOpenPower && (
          <div className="mt-3">
            <Button variant="secondary" onClick={onOpenPower}>Zum Leistungs-Modul</Button>
          </div>
        )}
      </div>
    );
  }

  const ref = results.find((r) => r!.setupId === referenceSetupId) ?? results[0];
  const series: Series[] = results.map((r, i) => ({
    label: r!.setupName,
    color: SIM_COLORS[i % SIM_COLORS.length],
    points: r!.points,
  }));

  return (
    <div>
      <p className="text-caption text-muted-foreground">
        Basis: stärkster Lauf <b className="text-foreground">{curve.segmentName}</b> aus „{curve.sessionName}“
        ({curve.peakPs.toFixed(0)} PS). Simuliert wird aus der gemessenen Radleistung über Drehzahl, mit Fahrwiderständen des
        Fahrzeugs, Schaltpausen von 0,35 s und einem Traktionslimit. Näherung, keine Prüfstandsgenauigkeit.
      </p>

      <div className="mt-3 -mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[420px] text-caption">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Setup</th>
              <th className="py-1 pr-2 font-medium">0–100</th>
              <th className="py-1 pr-2 font-medium">0–200</th>
              <th className="py-1 pr-2 font-medium">100–200</th>
              <th className="py-1 font-medium">Vmax</th>
            </tr>
          </thead>
          <tbody className="tabular-nums text-foreground">
            {results.map((r, i) => {
              const isRef = ref && r!.setupId === ref.setupId;
              return (
                <tr key={r!.setupId} className="border-t border-border">
                  <td className="py-1 pr-2">
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 flex-none rounded-full" style={{ background: SIM_COLORS[i % SIM_COLORS.length] }} aria-hidden="true" />
                      <span className="min-w-0 truncate">{r!.setupName}</span>
                      {isRef && <span className="flex-none rounded bg-secondary px-1 text-caption text-muted-foreground">Referenz</span>}
                    </span>
                  </td>
                  <td className="py-1 pr-2">
                    {fmt(r!.splits.t100)}
                    {!isRef && <span className="ml-1 text-muted-foreground">{delta(r!.splits.t100, ref?.splits.t100 ?? null)}</span>}
                  </td>
                  <td className="py-1 pr-2">
                    {fmt(r!.splits.t200)}
                    {!isRef && <span className="ml-1 text-muted-foreground">{delta(r!.splits.t200, ref?.splits.t200 ?? null)}</span>}
                  </td>
                  <td className="py-1 pr-2">{fmt(r!.splits.t100_200)}</td>
                  <td className="py-1">{r!.vMaxKmh.toFixed(0)} km/h</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <Chart
          series={series}
          xLabel="km/h"
          yLabel="s"
          xFormat={(v) => v.toFixed(0)}
          yFormat={(v) => v.toFixed(1)}
          height={320}
        />
      </div>
    </div>
  );
}
