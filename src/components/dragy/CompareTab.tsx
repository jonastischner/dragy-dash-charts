import { useMemo, useState } from "react";
import { Section, Note } from "./ui";
import { useAppStore } from "@/lib/dragy/store";
import { computeSegment, W_TO_PS } from "@/lib/dragy/physics";
import { Chart, type Series } from "./Chart";

type Mode = "pWheel" | "pEngine" | "tqWheel" | "tqEngine";
const MODE_LABEL: Record<Mode, string> = {
  pWheel: "Radleistung (PS)", pEngine: "Motorleistung geschätzt (PS)",
  tqWheel: "Rad-Drehmoment (Nm)", tqEngine: "Motor-Drehmoment geschätzt (Nm)",
};

export function CompareTab() {
  const { state, saveSegment } = useAppStore();
  const activeVehicle = state.vehicles.find((v) => v.id === state.activeVehicleId);
  const [mode, setMode] = useState<Mode>("pWheel");

  const segments = useMemo(() => {
    if (!activeVehicle) return [];
    const own = state.sessions.filter((s) => s.vehicleId === activeVehicle.id);
    return state.segments.filter((g) => own.some((s) => s.id === g.sessionId));
  }, [state, activeVehicle]);

  if (!activeVehicle) return <Section title="Leistungsvergleich"><Note>Kein aktives Fahrzeug.</Note></Section>;

  const series: Series[] = segments.map((g) => {
    const session = state.sessions.find((s) => s.id === g.sessionId)!;
    const samples = computeSegment(session, g, activeVehicle);
    const points = samples.map((s) => {
      let y: number = NaN;
      if (mode === "pWheel") y = s.pWheelW * W_TO_PS;
      else if (mode === "pEngine") y = s.pEngineW * W_TO_PS;
      else if (mode === "tqWheel") y = s.torqueWheelNm;
      else y = s.torqueEngineNm;
      return { x: s.rpm, y };
    }).filter((p) => Number.isFinite(p.y));
    return { label: `${session.name} · ${g.name}`, color: g.color, points, visible: g.visible };
  });

  const toggle = async (i: number) => {
    const g = segments[i]; if (!g) return;
    await saveSegment({ ...g, visible: !g.visible });
  };

  return (
    <div>
      <Section title="Vergleich" note="Motorleistung/-drehmoment sind Schätzungen (RPM aus Vmax abgeleitet, Schleppkurve als Näherung). Drehmoment ist gegenüber RPM-Faktor-Fehlern empfindlicher als die Leistung.">
        <div className="mb-2 flex flex-wrap gap-1">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`rounded px-2 py-1 text-xs ${mode === m ? "bg-sky-500 text-white" : "bg-slate-700 text-slate-200"}`}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        {segments.length === 0 ? (
          <p className="text-xs text-slate-400">Keine Läufe im aktiven Fahrzeug.</p>
        ) : (
          <Chart series={series} xLabel="U/min" yLabel={MODE_LABEL[mode]}
            xFormat={(v) => v.toFixed(0)} yFormat={(v) => v.toFixed(0)}
            onLegendToggle={toggle} height={340} />
        )}
      </Section>
    </div>
  );
}
