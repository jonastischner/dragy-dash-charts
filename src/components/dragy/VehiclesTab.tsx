import { useState } from "react";
import { Section, Field, TextInput, NumInput, Button, Note, Row } from "./ui";
import { useAppStore, newVehicle } from "@/lib/dragy/store";
import type { Vehicle, DragPoint } from "@/lib/dragy/types";

export function VehiclesTab() {
  const store = useAppStore();
  const { state, saveVehicle, deleteVehicle, setActive } = store;
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [confirmDel, setConfirmDel] = useState<Vehicle | null>(null);

  const startNew = () => setEditing(newVehicle("Neues Fahrzeug"));

  return (
    <div>
      <Section title="Fahrzeuge">
        {state.vehicles.length === 0 && <p className="text-xs text-slate-400">Noch keine Fahrzeuge angelegt.</p>}
        <ul className="space-y-2">
          {state.vehicles.map((v) => {
            const sessions = state.sessions.filter((s) => s.vehicleId === v.id).length;
            const isActive = state.activeVehicleId === v.id;
            return (
              <li key={v.id} className="rounded-md border border-slate-700 bg-slate-800 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-slate-100">
                      {v.name} {isActive && <span className="ml-1 rounded bg-sky-600 px-1 text-[10px]">aktiv</span>}
                    </div>
                    <div className="text-[11px] text-slate-400">{v.mass} kg · Cd {v.cd} · A {v.area} m² · {sessions} Sessions</div>
                  </div>
                  <div className="flex gap-1">
                    {!isActive && <Button variant="secondary" onClick={() => setActive(v.id)}>Aktivieren</Button>}
                    <Button variant="ghost" onClick={() => setEditing(v)}>Bearbeiten</Button>
                    <Button variant="danger" onClick={() => setConfirmDel(v)}>×</Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-3"><Button onClick={startNew}>+ Fahrzeug anlegen</Button></div>
      </Section>

      {editing && (
        <VehicleEditor
          vehicle={editing}
          onCancel={() => setEditing(null)}
          onSave={async (v) => { await saveVehicle(v); if (!state.activeVehicleId) await setActive(v.id); setEditing(null); }}
        />
      )}

      {confirmDel && (
        <ConfirmDelete
          vehicle={confirmDel}
          sessionCount={state.sessions.filter((s) => s.vehicleId === confirmDel.id).length}
          onCancel={() => setConfirmDel(null)}
          onConfirm={async () => { await deleteVehicle(confirmDel.id); setConfirmDel(null); }}
        />
      )}
    </div>
  );
}

function VehicleEditor({ vehicle, onSave, onCancel }: { vehicle: Vehicle; onSave: (v: Vehicle) => void; onCancel: () => void }) {
  const [v, setV] = useState<Vehicle>({ ...vehicle });

  const applyRpmMatch = () => {
    if (v.rpmMatch.maxKmh > 0) setV({ ...v, rpmFactorDefault: +(v.rpmMatch.maxRpm / v.rpmMatch.maxKmh).toFixed(3) });
  };

  const updateDrag = (i: number, patch: Partial<DragPoint>) => {
    const arr = v.dragCurve.slice(); arr[i] = { ...arr[i], ...patch }; setV({ ...v, dragCurve: arr });
  };
  const addDrag = () => setV({ ...v, dragCurve: [...v.dragCurve, { rpm: 8000, ps: 60 }] });
  const delDrag = (i: number) => setV({ ...v, dragCurve: v.dragCurve.filter((_, k) => k !== i) });

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-2 sm:items-center" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-slate-900 p-3 sm:rounded-xl">
        <h3 className="mb-2 text-base font-semibold text-slate-100">Fahrzeug bearbeiten</h3>
        <Field label="Name"><TextInput value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Row className="mt-2">
          <Field label="Masse (kg, inkl. Fahrer)"><NumInput value={v.mass} onChange={(e) => setV({ ...v, mass: +e.target.value })} /></Field>
          <Field label="Rollwiderstand Crr"><NumInput step="0.001" value={v.crr} onChange={(e) => setV({ ...v, crr: +e.target.value })} /></Field>
          <Field label="Cd"><NumInput step="0.01" value={v.cd} onChange={(e) => setV({ ...v, cd: +e.target.value })} /></Field>
          <Field label="Stirnfläche A (m²)"><NumInput step="0.01" value={v.area} onChange={(e) => setV({ ...v, area: +e.target.value })} /></Field>
          <Field label="Glättungsfenster (Punkte)" hint="1 = keine Glättung"><NumInput value={v.smoothingWindow} onChange={(e) => setV({ ...v, smoothingWindow: Math.max(1, +e.target.value) })} /></Field>
          <Field label="Cd·A kalibriert?">
            <label className="flex h-10 items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={v.calibrated} onChange={(e) => setV({ ...v, calibrated: e.target.checked })} />
              per Coastdown gemessen
            </label>
          </Field>
        </Row>

        <div className="mt-3 rounded-md border border-slate-700 p-2">
          <div className="mb-1 text-xs font-semibold text-slate-200">RPM-Faktor aus Vmax</div>
          <Note>Nur Vorgabe für neu angelegte Läufe. Bestehende Läufe bleiben unverändert.</Note>
          <Row className="mt-2">
            <Field label="Höchste erreichte Drehzahl"><NumInput value={v.rpmMatch.maxRpm} onChange={(e) => setV({ ...v, rpmMatch: { ...v.rpmMatch, maxRpm: +e.target.value } })} /></Field>
            <Field label="Geschwindigkeit dabei (km/h)"><NumInput value={v.rpmMatch.maxKmh} onChange={(e) => setV({ ...v, rpmMatch: { ...v.rpmMatch, maxKmh: +e.target.value } })} /></Field>
          </Row>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="secondary" onClick={applyRpmMatch}>Faktor berechnen</Button>
            <span className="text-xs text-slate-300">rpmFactor: <b>{v.rpmFactorDefault.toFixed(3)}</b> U/min pro km/h</span>
          </div>
        </div>

        <div className="mt-3 rounded-md border border-slate-700 p-2">
          <div className="mb-1 text-xs font-semibold text-slate-200">Schleppleistungskurve (Prüfstand)</div>
          <p className="text-[10px] text-slate-400">Stützpunkte RPM → PS. Lineare Interpolation, außerhalb geklemmt.</p>
          <div className="mt-2 space-y-1">
            {v.dragCurve.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <NumInput className="flex-1" value={d.rpm} onChange={(e) => updateDrag(i, { rpm: +e.target.value })} />
                <NumInput className="flex-1" value={d.ps} onChange={(e) => updateDrag(i, { ps: +e.target.value })} />
                <Button variant="danger" onClick={() => delDrag(i)}>×</Button>
              </div>
            ))}
          </div>
          <Button className="mt-2" variant="secondary" onClick={addDrag}>+ Stützpunkt</Button>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
          <Button onClick={() => onSave(v)}>Speichern</Button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDelete({ vehicle, sessionCount, onConfirm, onCancel }: { vehicle: Vehicle; sessionCount: number; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-lg bg-slate-900 p-3">
        <h3 className="text-sm font-semibold text-slate-100">Fahrzeug löschen?</h3>
        <p className="mt-2 text-xs text-slate-300"><b>{vehicle.name}</b> wird gelöscht. Dabei werden auch {sessionCount} zugehörige Session(s) inklusive aller Läufe entfernt.</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
          <Button variant="danger" onClick={onConfirm}>Endgültig löschen</Button>
        </div>
      </div>
    </div>
  );
}
