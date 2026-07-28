import { useState, useEffect } from "react";
import { Section, Field, TextInput, NumInput, Button, Note, Row } from "./ui";
import { useAppStore, newVehicle } from "@/lib/dragy/store";
import { uid } from "@/lib/dragy/db";
import { computeRpmFactor, tireCircumferenceM } from "@/lib/dragy/gear";
import type { Vehicle, DragPoint, GearPreset, Gearbox, GearRatio } from "@/lib/dragy/types";

function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
}

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
                  <div className="flex items-center gap-2 min-w-0">
                    {v.imageDataUrl && (
                      <img src={v.imageDataUrl} alt={v.name} className="h-12 w-12 flex-none rounded object-cover border border-slate-700" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-100 truncate">
                        {v.name} {isActive && <span className="ml-1 rounded bg-sky-600 px-1 text-[10px]">aktiv</span>}
                      </div>
                      <div className="text-[11px] text-slate-400">{v.mass} kg · Cd {v.cd} · A {v.area} m² · {sessions} Sessions</div>
                    </div>
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
  const [v, setV] = useState<Vehicle>(() => {
    const base: Vehicle = { ...vehicle };
    // Migration: Legacy `gearbox` einmalig in `gearboxes` überführen
    if ((!base.gearboxes || base.gearboxes.length === 0) && base.gearbox) {
      const migrated: Gearbox = { id: uid(), name: "Serie", ...base.gearbox };
      base.gearboxes = [migrated];
      if (!base.defaultGearboxId) base.defaultGearboxId = migrated.id;
    }
    return base;
  });

  const applyRpmMatch = () => {
    if (v.rpmMatch.maxKmh > 0) setV({ ...v, rpmFactorDefault: +(v.rpmMatch.maxRpm / v.rpmMatch.maxKmh).toFixed(3) });
  };

  const updateDrag = (i: number, patch: Partial<DragPoint>) => {
    const arr = v.dragCurve.slice(); arr[i] = { ...arr[i], ...patch }; setV({ ...v, dragCurve: arr });
  };
  const addDrag = () => setV({ ...v, dragCurve: [...v.dragCurve, { rpm: 8000, ps: 60 }] });
  const delDrag = (i: number) => setV({ ...v, dragCurve: v.dragCurve.filter((_, k) => k !== i) });

  const onPickImage = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await downscaleImage(file, 800, 0.82);
      setV({ ...v, imageDataUrl: dataUrl });
    } catch (e) {
      console.warn("[image] konnte nicht geladen werden", e);
    }
  };

  useLockBodyScroll();
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-2 sm:items-center"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)",
      }}
    >
      <div className="max-h-full w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-xl bg-slate-900 p-3 sm:rounded-xl">
        <h3 className="mb-2 text-base font-semibold text-slate-100">Fahrzeug bearbeiten</h3>
        <Field label="Name"><TextInput value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>

        <div className="mt-2 rounded-md border border-slate-700 p-2">
          <div className="mb-1 text-xs font-semibold text-slate-200">Fahrzeugbild</div>
          <div className="flex items-center gap-3">
            {v.imageDataUrl ? (
              <img src={v.imageDataUrl} alt={v.name} className="h-20 w-20 flex-none rounded object-cover border border-slate-700" />
            ) : (
              <div className="h-20 w-20 flex-none rounded border border-dashed border-slate-600 bg-slate-800 text-center text-[10px] text-slate-500 flex items-center justify-center">kein Bild</div>
            )}
            <div className="flex flex-col gap-1">
              <label className="cursor-pointer rounded-md bg-slate-700 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-600 w-fit">
                Bild wählen
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0] ?? null)} />
              </label>
              {v.imageDataUrl && (
                <Button variant="ghost" onClick={() => setV({ ...v, imageDataUrl: undefined })}>Bild entfernen</Button>
              )}
              <span className="text-[10px] text-slate-400">Wird auf max. 800 px verkleinert und lokal + in der Cloud gespeichert.</span>
            </div>
          </div>
        </div>

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

        <GearboxesManager
          gearboxes={v.gearboxes ?? []}
          defaultId={v.defaultGearboxId}
          onChange={(gbs, defaultId) => setV({ ...v, gearboxes: gbs, defaultGearboxId: defaultId })}
          onUseAsDefault={(f) => setV({ ...v, rpmFactorDefault: +f.toFixed(3) })}
        />


        <GearPresetsEditor
          presets={v.gearPresets ?? []}
          onChange={(gp) => setV({ ...v, gearPresets: gp })}
          onUseAsDefault={(f) => setV({ ...v, rpmFactorDefault: +f.toFixed(3) })}
        />


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
  useLockBodyScroll();
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm overscroll-contain rounded-lg bg-slate-900 p-3">
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

function GearPresetsEditor({ presets, onChange, onUseAsDefault }: {
  presets: GearPreset[];
  onChange: (p: GearPreset[]) => void;
  onUseAsDefault: (rpmFactor: number) => void;
}) {
  const addPreset = () => {
    const p: GearPreset = { id: uid(), name: `Preset ${presets.length + 1}`, gearRatio: 1, finalDrive: 3.46, tireSpec: "225/45R17", rpmFactor: 0 };
    const f = computeRpmFactor(p.gearRatio, p.finalDrive, p.tireSpec);
    if (f) p.rpmFactor = +f.toFixed(3);
    onChange([...presets, p]);
  };
  const update = (i: number, patch: Partial<GearPreset>) => {
    const arr = presets.slice();
    const merged = { ...arr[i], ...patch };
    const f = computeRpmFactor(merged.gearRatio, merged.finalDrive, merged.tireSpec);
    if (f) merged.rpmFactor = +f.toFixed(3);
    arr[i] = merged;
    onChange(arr);
  };
  const del = (i: number) => onChange(presets.filter((_, k) => k !== i));

  return (
    <div className="mt-3 rounded-md border border-slate-700 p-2">
      <div className="mb-1 text-xs font-semibold text-slate-200">Getriebe-Presets (rpmFactor aus Übersetzung)</div>
      <p className="text-[10px] text-slate-400">rpm/km/h = 60 · Getriebe · Endübersetzung / (3.6 · Reifenumfang). Reifen z.B. „225/45R17".</p>
      {presets.length === 0 && <p className="mt-1 text-[11px] text-slate-500">Noch keine Presets. Pro Gang ein Preset anlegen.</p>}
      <ul className="mt-2 space-y-2">
        {presets.map((p, i) => {
          const U = tireCircumferenceM(p.tireSpec);
          const valid = U !== null && p.gearRatio > 0 && p.finalDrive > 0;
          return (
            <li key={p.id} className="rounded-md border border-slate-700 bg-slate-900 p-2">
              <div className="flex items-center gap-2">
                <TextInput className="flex-1" value={p.name} onChange={(e) => update(i, { name: e.target.value })} />
                <Button variant="danger" onClick={() => del(i)}>×</Button>
              </div>
              <Row className="mt-2">
                <Field label="Getriebeübersetzung"><NumInput step="0.001" value={p.gearRatio} onChange={(e) => update(i, { gearRatio: +e.target.value })} /></Field>
                <Field label="Endübersetzung"><NumInput step="0.001" value={p.finalDrive} onChange={(e) => update(i, { finalDrive: +e.target.value })} /></Field>
                <Field label="Reifen (z.B. 225/45R17)"><TextInput value={p.tireSpec} onChange={(e) => update(i, { tireSpec: e.target.value })} /></Field>
                <Field label="rpmFactor (berechnet)">
                  <div className="flex h-10 items-center gap-2 text-xs text-slate-200">
                    <b>{valid ? p.rpmFactor.toFixed(3) : "–"}</b>
                    {valid && <Button variant="ghost" onClick={() => onUseAsDefault(p.rpmFactor)}>als Standard</Button>}
                  </div>
                </Field>
              </Row>
              {!valid && <p className="mt-1 text-[10px] text-amber-400">Reifenformat oder Übersetzungen ungültig.</p>}
            </li>
          );
        })}
      </ul>
      <Button className="mt-2" variant="secondary" onClick={addPreset}>+ Preset</Button>
    </div>
  );
}

function GearboxesManager({ gearboxes, defaultId, onChange, onUseAsDefault }: {
  gearboxes: Gearbox[];
  defaultId: string | undefined;
  onChange: (gbs: Gearbox[], defaultId: string | undefined) => void;
  onUseAsDefault: (rpmFactor: number) => void;
}) {
  const addGearbox = () => {
    const gb: Gearbox = { id: uid(), name: `Getriebe ${gearboxes.length + 1}`, finalDrive: 3.46, tireSpec: "225/45R17", gears: [] };
    const nextDefault = defaultId ?? gb.id;
    onChange([...gearboxes, gb], nextDefault);
  };
  const updateGearbox = (i: number, patch: Partial<Gearbox>) => {
    const arr = gearboxes.slice(); arr[i] = { ...arr[i], ...patch }; onChange(arr, defaultId);
  };
  const delGearbox = (i: number) => {
    const removed = gearboxes[i];
    const arr = gearboxes.filter((_, k) => k !== i);
    const nextDefault = defaultId === removed.id ? arr[0]?.id : defaultId;
    onChange(arr, nextDefault);
  };
  const setDefault = (id: string | undefined) => onChange(gearboxes, id);

  return (
    <div className="mt-3 rounded-md border border-slate-700 p-2">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-200">Getriebe-Konfigurationen</div>
        <Button variant="secondary" onClick={addGearbox}>+ Getriebe</Button>
      </div>
      <p className="text-[10px] text-slate-400">Mehrere Getriebe (z.B. Serie/Kurz) hinterlegen und eines als Standard markieren. Der Standard wird für neue Läufe verwendet.</p>
      {gearboxes.length === 0 && <p className="mt-2 text-[11px] text-slate-500">Noch keine Getriebe. „+ Getriebe" hinzufügen.</p>}
      <ul className="mt-2 space-y-2">
        {gearboxes.map((gb, i) => (
          <li key={gb.id ?? i} className="rounded-md border border-slate-700 bg-slate-900 p-2">
            <div className="flex items-center gap-2">
              <TextInput className="flex-1" value={gb.name ?? ""} placeholder="Name (z.B. Serie)" onChange={(e) => updateGearbox(i, { name: e.target.value })} />
              {gb.id && defaultId === gb.id ? (
                <span className="rounded bg-sky-600 px-2 py-1 text-[10px] text-white">Standard</span>
              ) : (
                <Button variant="ghost" onClick={() => setDefault(gb.id)}>als Standard</Button>
              )}
              <Button variant="danger" onClick={() => delGterEnsureId(i, delGearbox)}>×</Button>
            </div>
            <GearboxEditor
              gearbox={gb}
              onChange={(patch) => updateGearbox(i, patch)}
              onUseAsDefault={onUseAsDefault}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function delGterEnsureId(i: number, fn: (i: number) => void) { fn(i); }

function GearboxEditor({ gearbox, onChange, onUseAsDefault }: {
  gearbox: Gearbox;
  onChange: (patch: Partial<Gearbox>) => void;
  onUseAsDefault: (rpmFactor: number) => void;
}) {
  const gb = gearbox;
  const U = tireCircumferenceM(gb.tireSpec);
  const addGear = () => {
    const n = gb.gears.length + 1;
    const gear: GearRatio = { id: uid(), name: `${n}. Gang`, ratio: 1 };
    onChange({ gears: [...gb.gears, gear] });
  };
  const updateGear = (i: number, patch: Partial<GearRatio>) => {
    const arr = gb.gears.slice(); arr[i] = { ...arr[i], ...patch }; onChange({ gears: arr });
  };
  const delGear = (i: number) => onChange({ gears: gb.gears.filter((_, k) => k !== i) });

  const factorFor = (ratio: number) => computeRpmFactor(ratio, gb.finalDrive, gb.tireSpec);

  return (
    <div className="mt-2">
      <Row>
        <Field label="Endübersetzung"><NumInput step="0.001" value={gb.finalDrive} onChange={(e) => onChange({ finalDrive: +e.target.value })} /></Field>
        <Field label="Reifen (z.B. 225/45R17)"><TextInput value={gb.tireSpec} onChange={(e) => onChange({ tireSpec: e.target.value })} /></Field>
      </Row>
      {gb.gears.length === 0 && <p className="mt-2 text-[11px] text-slate-500">Noch keine Gänge. „+ Gang" hinzufügen.</p>}
      <ul className="mt-2 space-y-2">
        {gb.gears.map((g, i) => {
          const f = factorFor(g.ratio);
          const valid = U !== null && g.ratio > 0 && gb.finalDrive > 0 && f !== null;
          return (
            <li key={g.id} className="rounded-md border border-slate-700 bg-slate-950 p-2">
              <Row>
                <Field label="Bezeichnung"><TextInput value={g.name} onChange={(e) => updateGear(i, { name: e.target.value })} /></Field>
                <Field label="Übersetzung"><NumInput step="0.001" value={g.ratio} onChange={(e) => updateGear(i, { ratio: +e.target.value })} /></Field>
                <Field label="rpmFactor (berechnet)">
                  <div className="flex h-10 items-center gap-2 text-xs text-slate-200">
                    <b>{valid ? f!.toFixed(3) : "–"}</b>
                    {valid && <Button variant="ghost" onClick={() => onUseAsDefault(f!)}>als Standard</Button>}
                    <Button variant="danger" onClick={() => delGear(i)}>×</Button>
                  </div>
                </Field>
              </Row>
              {!valid && <p className="mt-1 text-[10px] text-amber-400">Reifenformat oder Übersetzung ungültig.</p>}
            </li>
          );
        })}
      </ul>
      <Button className="mt-2" variant="secondary" onClick={addGear}>+ Gang</Button>
    </div>
  );
}



async function downscaleImage(file: File, maxSize: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", quality);
}
