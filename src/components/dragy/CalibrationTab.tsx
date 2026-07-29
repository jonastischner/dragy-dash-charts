import { useMemo, useState } from "react";
import { Section, Field, NumInput, Button, Note, Row, EmptyState } from "./ui";
import { useAppStore } from "@/lib/dragy/store";
import { coastdownFit, autoDetectCoastdown } from "@/lib/dragy/physics";
import { Chart } from "./Chart";
import type { Session, Segment } from "@/lib/dragy/types";

export function CalibrationTab({ onOpenVehicles }: { onOpenVehicles?: () => void } = {}) {
  const { state, saveVehicle, saveSegment } = useAppStore();
  const activeVehicle = state.vehicles.find((v) => v.id === state.activeVehicleId);
  const [sessionId, setSessionId] = useState<string>("");
  const [startT, setStartT] = useState(0);
  const [endT, setEndT] = useState(0);
  const [segTarget, setSegTarget] = useState<string>("");

  const sessions = activeVehicle ? state.sessions.filter((s) => s.vehicleId === activeVehicle.id) : [];
  const session = sessions.find((s) => s.id === sessionId);
  const maxT = session?.records[session.records.length - 1]?.t ?? 0;

  const fit = useMemo(() => {
    if (!session || !activeVehicle) return null;
    const mass = session.massOverride && session.massOverride > 0 ? session.massOverride : activeVehicle.mass;
    return coastdownFit(session, startT, endT, mass);
  }, [session, startT, endT, activeVehicle]);

  if (!activeVehicle) return <Section title="Kalibrierung"><EmptyState title="Kein aktives Fahrzeug" description="Kalibrierung benötigt ein aktives Fahrzeug mit Sessions." actionLabel="Zu Fahrzeuge" onAction={onOpenVehicles} /></Section>;


  const speedSeries = session ? [{
    label: "km/h", color: "#38bdf8",
    points: session.records.map((r) => ({ x: r.t, y: r.speedKmh })),
  }] : [];
  const bands = session ? [{ xStart: startT, xEnd: endT, color: "#f59e0b", label: "Coastdown" }] : [];

  const applyToVehicle = async () => {
    if (!fit) return;
    await saveVehicle({ ...activeVehicle, crr: +fit.crr.toFixed(5), cd: +(fit.cdA / activeVehicle.area).toFixed(4), calibrated: true });
    alert("Fahrzeug-Standard aktualisiert.");
  };

  const applyToSegment = async () => {
    if (!fit) return;
    const seg = state.segments.find((g) => g.id === segTarget);
    if (!seg) return alert("Segment wählen.");
    await saveSegment({ ...seg, calibration: { crr: fit.crr, cdA: fit.cdA } });
    alert("Segment-Kalibrierung gesetzt.");
  };

  return (
    <div>
      <Section title="Coastdown-Kalibrierung" note="Bereich in Ausrollphase (ausgekuppelt, kein Gefälle, kein Wind) markieren.">
        <Field label="Session">
          <select className="w-full rounded-md border border-input bg-muted px-2 py-2 text-sm text-foreground"
            value={sessionId} onChange={(e) => { setSessionId(e.target.value); setStartT(0); setEndT(0); }}>
            <option value="">—</option>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>

        {session && (
          <>
            <Row className="mt-2">
              <Field label="Start t (s)"><NumInput step="0.1" value={startT} onChange={(e) => setStartT(Math.max(0, +e.target.value))} /></Field>
              <Field label="Ende t (s)"><NumInput step="0.1" value={endT} onChange={(e) => setEndT(Math.min(maxT, +e.target.value))} /></Field>
            </Row>
            <div className="mt-2">
              <Button variant="secondary" onClick={() => {
                const d = autoDetectCoastdown(session);
                if (!d) { alert("Keine geeignete Ausrollphase gefunden."); return; }
                setStartT(+d.startT.toFixed(2));
                setEndT(+d.endT.toFixed(2));
              }}>Auto-Erkennung</Button>
            </div>
            <div className="mt-2">
              <Chart series={speedSeries} bands={bands} xLabel="t (s)" yLabel="km/h" xFormat={(v) => v.toFixed(1)} yFormat={(v) => v.toFixed(0)} />
            </div>

            {fit && (
              <div className="mt-2 rounded-md border border-border p-2 text-xs text-foreground">
                <div>Crr: <b>{fit.crr.toFixed(5)}</b></div>
                <div>Cd·A: <b>{fit.cdA.toFixed(3)}</b> m² (→ Cd ≈ {(fit.cdA / activeVehicle.area).toFixed(3)} bei A={activeVehicle.area})</div>
                <div>R²: <b>{fit.r2.toFixed(3)}</b> ({fit.n} Punkte)</div>
                {fit.r2 < 0.85 && <p className="mt-1 text-amber-300">Warnung: R² &lt; 0.85 – möglicherweise Gefälle/Wind im gewählten Abschnitt.</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button onClick={applyToVehicle}>Als Fahrzeug-Standard</Button>
                  <select className="rounded-md border border-input bg-muted px-2 py-1 text-xs text-foreground"
                    value={segTarget} onChange={(e) => setSegTarget(e.target.value)}>
                    <option value="">— nur für Lauf …</option>
                    {state.segments.filter((g) => g.sessionId === session.id).map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  <Button variant="secondary" onClick={applyToSegment}>Nur diesem Lauf</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
