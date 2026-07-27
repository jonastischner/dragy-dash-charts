import { useMemo, useState } from "react";
import { Section, Field, TextInput, TextArea, NumInput, Button, Note, Row } from "./ui";
import { useAppStore, pickColor } from "@/lib/dragy/store";
import { autoDetectSegments } from "@/lib/dragy/physics";
import { uid } from "@/lib/dragy/db";
import type { Session, Segment } from "@/lib/dragy/types";
import { Chart } from "./Chart";

export function SessionsTab() {
  const { state, saveSession, deleteSession, saveSegment, deleteSegment } = useAppStore();
  const activeVehicle = state.vehicles.find((v) => v.id === state.activeVehicleId);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!activeVehicle) return <Section title="Sessions & Läufe"><Note>Kein aktives Fahrzeug.</Note></Section>;

  const sessions = state.sessions.filter((s) => s.vehicleId === activeVehicle.id).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div>
      <Section title={`Sessions – ${activeVehicle.name}`}>
        {sessions.length === 0 && <p className="text-xs text-slate-400">Noch keine Sessions. Reiter „Import" nutzen.</p>}
        <ul className="space-y-2">
          {sessions.map((s) => {
            const segs = state.segments.filter((g) => g.sessionId === s.id);
            const isOpen = expanded === s.id;
            const dur = s.records.length ? s.records[s.records.length - 1].t : 0;
            return (
              <li key={s.id} className="rounded-md border border-slate-700 bg-slate-800">
                <button className="flex w-full items-center justify-between p-2 text-left" onClick={() => setExpanded(isOpen ? null : s.id)}>
                  <div>
                    <div className="text-sm font-medium text-slate-100">{s.name} {s.manual && <span className="ml-1 rounded bg-amber-700 px-1 text-[10px]">manuell</span>}</div>
                    <div className="text-[11px] text-slate-400">{dur.toFixed(1)} s · {s.records.length} Punkte · {segs.length} Lauf/Läufe</div>
                  </div>
                  <span className="text-slate-400">{isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen && (
                  <SessionDetail
                    session={s}
                    segments={segs}
                    vehicle={activeVehicle}
                    onRename={async (name) => { await saveSession({ ...s, name }); }}
                    onDelete={async () => { if (confirm(`Session "${s.name}" löschen (${segs.length} Läufe)?`)) { await deleteSession(s.id); setExpanded(null); } }}
                    onSaveSeg={saveSegment}
                    onDelSeg={deleteSegment}
                    onEnvUpdate={async (patch) => { await saveSession({ ...s, ...patch }); }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

function SessionDetail({ session, segments, vehicle, onRename, onDelete, onSaveSeg, onDelSeg, onEnvUpdate }: {
  session: Session; segments: Segment[]; vehicle: any;
  onRename: (n: string) => void; onDelete: () => void;
  onSaveSeg: (s: Segment) => Promise<void>; onDelSeg: (id: string) => Promise<void>;
  onEnvUpdate: (patch: Partial<Session>) => Promise<void>;
}) {
  const [name, setName] = useState(session.name);
  const [autoStart, setAutoStart] = useState(30);
  const [autoTarget, setAutoTarget] = useState(150);
  const [autoMin, setAutoMin] = useState(40);

  const speedSeries = useMemo(() => [{
    label: "Geschwindigkeit (km/h)", color: "#38bdf8",
    points: session.records.map((r) => ({ x: r.t, y: r.speedKmh })),
  }], [session.records]);

  const bands = segments.map((g) => ({ xStart: g.startT, xEnd: g.endT, color: g.color, label: g.name }));

  const addSegment = async () => {
    const i = segments.length;
    const dur = session.records[session.records.length - 1]?.t ?? 0;
    const seg: Segment = {
      id: uid(), sessionId: session.id, name: `Lauf ${i + 1}`,
      startT: 0, endT: dur, rpmFactor: vehicle.rpmFactorDefault,
      color: pickColor(i), visible: true,
    };
    await onSaveSeg(seg);
  };

  const doAutoDetect = async () => {
    const found = autoDetectSegments(session.records, autoStart, autoTarget, autoMin);
    if (found.length === 0) return alert("Keine Läufe erkannt. Parameter anpassen.");
    if (!confirm(`${found.length} Lauf/Läufe erkannt. Als Vorschlag anlegen (bestehende bleiben)?`)) return;
    for (let i = 0; i < found.length; i++) {
      const seg: Segment = {
        id: uid(), sessionId: session.id, name: `Auto ${segments.length + i + 1}`,
        startT: found[i].startT, endT: found[i].endT,
        rpmFactor: vehicle.rpmFactorDefault,
        color: pickColor(segments.length + i), visible: true,
      };
      await onSaveSeg(seg);
    }
  };

  return (
    <div className="border-t border-slate-700 p-2">
      <Row>
        <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} onBlur={() => onRename(name)} /></Field>
        <div className="flex items-end justify-end"><Button variant="danger" onClick={onDelete}>Session löschen</Button></div>
      </Row>
      <Row className="mt-2">
        <Field label="Temperatur (°C)"><NumInput value={session.tempC} onChange={(e) => onEnvUpdate({ tempC: +e.target.value })} /></Field>
        <Field label="Druck (hPa)"><NumInput value={session.pressureHpa} onChange={(e) => onEnvUpdate({ pressureHpa: +e.target.value })} /></Field>
        <Field label="Luftfeuchte (%)"><NumInput value={session.rh} onChange={(e) => onEnvUpdate({ rh: +e.target.value })} /></Field>
      </Row>
      <div className="mt-2">
        <Field label="Notizen zur Session" hint="z.B. Strecke, Wetter, Setup">
          <TextArea rows={3} value={session.notes ?? ""} onChange={(e) => onEnvUpdate({ notes: e.target.value })} placeholder="Notizen…" />
        </Field>
      </div>

      <details className="mt-2 rounded-md border border-slate-700 bg-slate-900/50">
        <summary className="cursor-pointer select-none px-2 py-1.5 text-xs font-semibold text-slate-300">
          Erweitert
        </summary>
        <div className="p-2">
          <Field
            label="Gewicht für diese Session (kg)"
            hint={`Optional. Leer = Fahrzeug-Standard (${vehicle.mass} kg). Wirkt auf Leistung, Drehmoment und Kalibrierung.`}
          >
            <NumInput
              value={session.massOverride ?? ""}
              placeholder={`${vehicle.mass}`}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "" || raw == null) {
                  onEnvUpdate({ massOverride: undefined });
                } else {
                  const n = +raw;
                  onEnvUpdate({ massOverride: Number.isFinite(n) && n > 0 ? n : undefined });
                }
              }}
            />
          </Field>
        </div>
      </details>

      <div className="mt-2">
        <Chart series={speedSeries} bands={bands} xLabel="t (s)" yLabel="km/h" xFormat={(v) => v.toFixed(1)} yFormat={(v) => v.toFixed(0)} />
      </div>

      <div className="mt-3 rounded-md border border-slate-700 p-2">
        <div className="text-xs font-semibold text-slate-200">Auto-Erkennung (Vorschlag, danach prüfen)</div>
        <Note>Sucht rückwärts von Zielgeschwindigkeit zum tiefsten Punkt des vorangegangenen Anstiegs.</Note>
        <Row className="mt-2">
          <Field label="Start ≈ (km/h)"><NumInput value={autoStart} onChange={(e) => setAutoStart(+e.target.value)} /></Field>
          <Field label="Ziel ≈ (km/h)"><NumInput value={autoTarget} onChange={(e) => setAutoTarget(+e.target.value)} /></Field>
          <Field label="Min. Anstieg (km/h)"><NumInput value={autoMin} onChange={(e) => setAutoMin(+e.target.value)} /></Field>
        </Row>
        <Button className="mt-2" variant="secondary" onClick={doAutoDetect}>Läufe erkennen</Button>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-200">Läufe</h4>
          <Button variant="secondary" onClick={addSegment}>+ Lauf</Button>
        </div>
        <ul className="space-y-2">
          {segments.map((g) => (
            <SegmentEditor key={g.id} seg={g} maxT={session.records[session.records.length - 1]?.t ?? 0}
              onChange={async (patch) => { await onSaveSeg({ ...g, ...patch }); }}
              onDelete={async () => { if (confirm(`Lauf "${g.name}" löschen?`)) await onDelSeg(g.id); }} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function SegmentEditor({ seg, maxT, onChange, onDelete }: { seg: Segment; maxT: number; onChange: (patch: Partial<Segment>) => Promise<void>; onDelete: () => void }) {
  return (
    <li className="rounded-md border border-slate-700 bg-slate-900 p-2">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-slate-300">
          <input type="checkbox" checked={seg.visible} onChange={(e) => onChange({ visible: e.target.checked })} />
          sichtbar
        </label>
        <label className="relative h-6 w-6 flex-none cursor-pointer rounded border border-slate-600" style={{ backgroundColor: seg.color }} title="Farbe ändern">
          <input
            type="color"
            value={seg.color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Farbe wählen"
          />
        </label>
        <TextInput className="flex-1" value={seg.name} onChange={(e) => onChange({ name: e.target.value })} />
        <Button variant="danger" onClick={onDelete}>×</Button>
      </div>
      <Row className="mt-2">
        <Field label="Start t (s)"><NumInput step="0.1" value={seg.startT} onChange={(e) => onChange({ startT: Math.max(0, +e.target.value) })} /></Field>
        <Field label="Ende t (s)"><NumInput step="0.1" value={seg.endT} onChange={(e) => onChange({ endT: Math.min(maxT, +e.target.value) })} /></Field>
        <Field label="rpmFactor (U/min pro km/h)" hint="Schätzung, gilt nur pro Gang"><NumInput step="0.01" value={seg.rpmFactor} onChange={(e) => onChange({ rpmFactor: +e.target.value })} /></Field>
        {seg.calibration && (
          <Field label="Segment-Kalibrierung">
            <div className="text-[11px] text-slate-300">Crr {seg.calibration.crr.toFixed(4)} · CdA {seg.calibration.cdA.toFixed(3)}
              <button className="ml-2 text-red-400 underline" onClick={() => onChange({ calibration: undefined })}>entfernen</button>
            </div>
          </Field>
        )}
      </Row>
      <div className="mt-2">
        <Field label="Notizen zum Lauf" hint="z.B. Gang, Bedingungen, Auffälligkeiten">
          <TextArea rows={2} value={seg.notes ?? ""} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Notizen…" />
        </Field>
      </div>
    </li>
  );
}
