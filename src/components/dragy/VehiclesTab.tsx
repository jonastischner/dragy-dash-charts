import { useState, useEffect } from "react";
import { ChevronRight, Copy } from "lucide-react";

import { Section, Field, TextInput, NumInput, Button, Note, Row, Collapsible, IconButton, AddButton, Select, usePersistedState } from "./ui";
import { useAppStore, newVehicle } from "@/lib/dragy/store";

import { uid } from "@/lib/dragy/db";
import { computeRpmFactor, tireCircumferenceM, normalizeDrive, resolveAllGears } from "@/lib/dragy/gear";
import type { Vehicle, DragPoint, GearPreset, GearboxDef, FinalDriveDef, TireDef, DriveSetup, GearRatio } from "@/lib/dragy/types";
import { Chart, type Series } from "./Chart";


function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
}

export function VehiclesTab() {
  const store = useAppStore();
  const { state, saveVehicle, deleteVehicle, duplicateVehicle, setActive } = store;
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [confirmDel, setConfirmDel] = useState<Vehicle | null>(null);

  const startNew = () => setEditing(newVehicle("Neues Fahrzeug"));
  const onDuplicate = async (v: Vehicle) => {
    const copy = await duplicateVehicle(v);
    setEditing(copy);
  };

  return (
    <div>
      <Section title="Fahrzeuge">
        {state.vehicles.length === 0 && <p className="text-xs text-muted-foreground">Noch keine Fahrzeuge angelegt.</p>}
        <ul className="space-y-2">
          {state.vehicles.map((v) => {
            const sessions = state.sessions.filter((s) => s.vehicleId === v.id).length;
            const isActive = state.activeVehicleId === v.id;
            return (
              <li key={v.id} className="rounded-md border border-border bg-muted p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {v.imageDataUrl && (
                      <img src={v.imageDataUrl} alt={v.name} className="h-12 w-12 flex-none rounded object-cover border border-border" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {v.name} {isActive && <span className="ml-1 rounded bg-primary px-1 text-[10px]">aktiv</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{v.mass} kg · Cd {v.cd} · A {v.area} m² · {sessions} Sessions</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!isActive && <Button variant="secondary" onClick={() => setActive(v.id)}>Aktivieren</Button>}
                    <Button variant="ghost" onClick={() => setEditing(v)}>Bearbeiten</Button>
                    <button
                      type="button"
                      aria-label={`${v.name} duplizieren`}
                      title={`${v.name} duplizieren`}
                      onClick={() => onDuplicate(v)}
                      className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <IconButton label={`${v.name} löschen`} onClick={() => setConfirmDel(v)} />
                  </div>

                </div>
              </li>
            );
          })}
        </ul>
        <AddButton onClick={startNew}>Fahrzeug anlegen</AddButton>
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
    // Migration: alte gearboxes[]/gearbox in getrennte gearboxDefs/finalDrives/setups überführen.
    const alreadyMigrated = (base.setups && base.setups.length > 0) || (base.gearboxDefs && base.gearboxDefs.length > 0);
    if (!alreadyMigrated) {
      const norm = normalizeDrive(base);
      base.gearboxDefs = norm.gearboxDefs;
      base.finalDrives = norm.finalDrives;
      base.tires = norm.tires;
      base.setups = norm.setups;
      base.defaultSetupId = norm.defaultSetupId;
      // Legacy-Felder leeren, sobald migriert wurde
      if (base.setups.length > 0) {
        base.gearboxes = undefined;
        base.defaultGearboxId = undefined;
        base.gearbox = undefined;
      }
    } else {
      // Bereits migriert, aber ggf. neue Reifen-Ebene nachziehen (aus GearboxDef.tireSpec).
      const hasTires = (base.tires && base.tires.length > 0);
      const gbTireSpec = base.gearboxDefs?.some((g) => g.tireSpec);
      if (!hasTires && gbTireSpec) {
        const norm = normalizeDrive(base);
        base.tires = norm.tires;
        base.setups = norm.setups;
      }
    }
    if (!base.gearboxDefs) base.gearboxDefs = [];
    if (!base.finalDrives) base.finalDrives = [];
    if (!base.tires) base.tires = [];
    if (!base.setups) base.setups = [];
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
      <div className="max-h-full w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-xl bg-card sm:rounded-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card/95 px-3 py-2 backdrop-blur">
          <h3 className="text-base font-semibold text-foreground">Fahrzeug bearbeiten</h3>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
            <Button onClick={() => onSave(v)}>Speichern</Button>
          </div>
        </div>
        <div className="p-3">
        <Field label="Name"><TextInput value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>

        <Collapsible title="Fahrzeugbild" persistKey="vehicleEditor.image" subtitle={v.imageDataUrl ? "Bild hinterlegt" : "kein Bild"}>
          <div className="flex items-center gap-3">
            {v.imageDataUrl ? (
              <img src={v.imageDataUrl} alt={v.name} className="h-20 w-20 flex-none rounded object-cover border border-border" />
            ) : (
              <div className="h-20 w-20 flex-none rounded border border-dashed border-input bg-muted text-center text-[10px] text-muted-foreground flex items-center justify-center">kein Bild</div>
            )}
            <div className="flex flex-col gap-1">
              <label className="cursor-pointer rounded-md bg-secondary px-3 py-1.5 text-xs text-foreground hover:bg-secondary w-fit">
                Bild wählen
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0] ?? null)} />
              </label>
              {v.imageDataUrl && (
                <Button variant="ghost" onClick={() => setV({ ...v, imageDataUrl: undefined })}>Bild entfernen</Button>
              )}
              <span className="text-[10px] text-muted-foreground">Wird auf max. 800 px verkleinert und lokal + in der Cloud gespeichert.</span>
            </div>
          </div>
        </Collapsible>

        <Collapsible title="Fahrzeugdaten" persistKey="vehicleEditor.basics" defaultOpen subtitle={`${v.mass} kg · Cd ${v.cd} · A ${v.area} m²`}>
          <Row>
            <Field label="Masse (kg, inkl. Fahrer)"><NumInput value={v.mass} onChange={(e) => setV({ ...v, mass: +e.target.value })} /></Field>
            <Field label="Rollwiderstand Crr"><NumInput step="0.001" value={v.crr} onChange={(e) => setV({ ...v, crr: +e.target.value })} /></Field>
            <Field label="Cd"><NumInput step="0.01" value={v.cd} onChange={(e) => setV({ ...v, cd: +e.target.value })} /></Field>
            <Field label="Stirnfläche A (m²)"><NumInput step="0.01" value={v.area} onChange={(e) => setV({ ...v, area: +e.target.value })} /></Field>
            <Field label="Glättungsfenster (Punkte)" hint="1 = keine Glättung"><NumInput value={v.smoothingWindow} onChange={(e) => setV({ ...v, smoothingWindow: Math.max(1, +e.target.value) })} /></Field>
            <Field label="Cd·A kalibriert?">
              <label className="flex h-10 items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={v.calibrated} onChange={(e) => setV({ ...v, calibrated: e.target.checked })} />
                per Coastdown gemessen
              </label>
            </Field>
          </Row>
        </Collapsible>

        <Collapsible title="Drehzahlen" persistKey="vehicleEditor.rpms" subtitle={`Schalt ${v.shiftRpm ?? "–"} · Max ${v.maxRpm ?? "–"} U/min`}>
          <Row>
            <Field label="Schaltdrehzahl (U/min)" hint="Empfohlener Schaltpunkt für Schaltdiagramm">
              <NumInput value={v.shiftRpm ?? ""} placeholder="z.B. 6500" onChange={(e) => setV({ ...v, shiftRpm: e.target.value === "" ? undefined : +e.target.value })} />
            </Field>
            <Field label="Maximaldrehzahl (U/min)" hint="Begrenzer / Redline">
              <NumInput value={v.maxRpm ?? ""} placeholder="z.B. 7200" onChange={(e) => setV({ ...v, maxRpm: e.target.value === "" ? undefined : +e.target.value })} />
            </Field>
          </Row>
        </Collapsible>

        <Collapsible title="RPM-Faktor aus Vmax" persistKey="vehicleEditor.rpmMatch" subtitle={`${v.rpmFactorDefault.toFixed(3)} U/min pro km/h`}>
          <Note>Nur Vorgabe für neu angelegte Läufe. Bestehende Läufe bleiben unverändert.</Note>
          <Row className="mt-2">
            <Field label="Höchste erreichte Drehzahl"><NumInput value={v.rpmMatch.maxRpm} onChange={(e) => setV({ ...v, rpmMatch: { ...v.rpmMatch, maxRpm: +e.target.value } })} /></Field>
            <Field label="Geschwindigkeit dabei (km/h)"><NumInput value={v.rpmMatch.maxKmh} onChange={(e) => setV({ ...v, rpmMatch: { ...v.rpmMatch, maxKmh: +e.target.value } })} /></Field>
          </Row>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="secondary" onClick={applyRpmMatch}>Faktor berechnen</Button>
            <span className="text-xs text-muted-foreground">rpmFactor: <b>{v.rpmFactorDefault.toFixed(3)}</b> U/min pro km/h</span>
          </div>
        </Collapsible>

        <AntriebManager
          gearboxDefs={v.gearboxDefs ?? []}
          finalDrives={v.finalDrives ?? []}
          tires={v.tires ?? []}
          setups={v.setups ?? []}
          defaultSetupId={v.defaultSetupId}
          onChange={(patch) => setV({ ...v, ...patch })}
          onUseAsDefault={(f) => setV({ ...v, rpmFactorDefault: +f.toFixed(3) })}
        />

        <ShiftDiagramCompare vehicle={v} />

        <GearPresetsEditor
          presets={v.gearPresets ?? []}
          onChange={(gp) => setV({ ...v, gearPresets: gp })}
          onUseAsDefault={(f) => setV({ ...v, rpmFactorDefault: +f.toFixed(3) })}
        />

        <Collapsible title="Schleppleistungskurve (Prüfstand)" persistKey="vehicleEditor.dragCurve" subtitle={`${v.dragCurve.length} Stützpunkte`}>
          <p className="text-[10px] text-muted-foreground">Stützpunkte RPM → PS. Lineare Interpolation, außerhalb geklemmt.</p>
          <div className="mt-2 space-y-1">
            {v.dragCurve.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <NumInput className="flex-1" value={d.rpm} onChange={(e) => updateDrag(i, { rpm: +e.target.value })} />
                <NumInput className="flex-1" value={d.ps} onChange={(e) => updateDrag(i, { ps: +e.target.value })} />
                <IconButton label="Stützpunkt löschen" onClick={() => delDrag(i)} />
              </div>
            ))}
          </div>
          <AddButton onClick={addDrag}>Stützpunkt</AddButton>
        </Collapsible>

        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
          <Button onClick={() => onSave(v)}>Speichern</Button>
        </div>
        </div>
      </div>
    </div>
  );
}


function ConfirmDelete({ vehicle, sessionCount, onConfirm, onCancel }: { vehicle: Vehicle; sessionCount: number; onConfirm: () => void; onCancel: () => void }) {
  useLockBodyScroll();
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm overscroll-contain rounded-lg bg-card p-3">
        <h3 className="text-sm font-semibold text-foreground">Fahrzeug löschen?</h3>
        <p className="mt-2 text-xs text-muted-foreground"><b>{vehicle.name}</b> wird gelöscht. Dabei werden auch {sessionCount} zugehörige Session(s) inklusive aller Läufe entfernt.</p>
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
  if (presets.length === 0) return null; // Legacy: nur anzeigen, wenn schon Presets existieren
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
    <Collapsible title="Legacy Getriebe-Presets" persistKey="vehicleEditor.legacyPresets" subtitle={`${presets.length} Alt-Presets`}>
      <p className="text-[10px] text-muted-foreground">Bestehende Alt-Presets. Neue Konfigurationen bitte oben unter „Antrieb" anlegen.</p>
      <ul className="mt-2 space-y-2">
        {presets.map((p, i) => {
          const U = tireCircumferenceM(p.tireSpec);
          const valid = U !== null && p.gearRatio > 0 && p.finalDrive > 0;
          return (
            <li key={p.id} className="rounded-md border border-border bg-card p-2">
              <div className="flex items-center gap-2">
                <TextInput className="flex-1" value={p.name} onChange={(e) => update(i, { name: e.target.value })} />
                <IconButton label="Preset löschen" onClick={() => del(i)} />
              </div>
              <Row className="mt-2">
                <Field label="Getriebeübersetzung"><NumInput step="0.001" value={p.gearRatio} onChange={(e) => update(i, { gearRatio: +e.target.value })} /></Field>
                <Field label="Endübersetzung"><NumInput step="0.001" value={p.finalDrive} onChange={(e) => update(i, { finalDrive: +e.target.value })} /></Field>
                <Field label="Reifen"><TextInput value={p.tireSpec} onChange={(e) => update(i, { tireSpec: e.target.value })} /></Field>
                <Field label="rpmFactor">
                  <div className="flex h-10 items-center gap-2 text-xs text-foreground">
                    <b>{valid ? p.rpmFactor.toFixed(3) : "–"}</b>
                    {valid && <Button variant="ghost" onClick={() => onUseAsDefault(p.rpmFactor)}>als Standard</Button>}
                  </div>
                </Field>
              </Row>
            </li>
          );
        })}
      </ul>
    </Collapsible>
  );
}


// ================= Antrieb (Getriebe + Endübersetzung + Setups) =================

function AntriebManager({ gearboxDefs, finalDrives, tires, setups, defaultSetupId, onChange, onUseAsDefault }: {
  gearboxDefs: GearboxDef[];
  finalDrives: FinalDriveDef[];
  tires: TireDef[];
  setups: DriveSetup[];
  defaultSetupId: string | undefined;
  onChange: (patch: { gearboxDefs?: GearboxDef[]; finalDrives?: FinalDriveDef[]; tires?: TireDef[]; setups?: DriveSetup[]; defaultSetupId?: string | undefined }) => void;
  onUseAsDefault: (rpmFactor: number) => void;
}) {
  // -- Gearbox actions
  const addGearbox = () => {
    const gb: GearboxDef = { id: uid(), name: `Getriebe ${gearboxDefs.length + 1}`, gears: [] };
    onChange({ gearboxDefs: [...gearboxDefs, gb] });
  };
  const updateGearbox = (i: number, patch: Partial<GearboxDef>) => {
    const arr = gearboxDefs.slice(); arr[i] = { ...arr[i], ...patch }; onChange({ gearboxDefs: arr });
  };
  const delGearbox = (i: number) => {
    const removed = gearboxDefs[i];
    const arr = gearboxDefs.filter((_, k) => k !== i);
    const nextSetups = setups.filter((s) => s.gearboxId !== removed.id);
    const nextDefault = nextSetups.find((s) => s.id === defaultSetupId) ? defaultSetupId : nextSetups[0]?.id;
    onChange({ gearboxDefs: arr, setups: nextSetups, defaultSetupId: nextDefault });
  };

  // -- Final drive actions
  const addFinal = () => {
    const fd: FinalDriveDef = { id: uid(), name: `Endübersetzung ${finalDrives.length + 1}`, ratio: 3.46 };
    onChange({ finalDrives: [...finalDrives, fd] });
  };
  const updateFinal = (i: number, patch: Partial<FinalDriveDef>) => {
    const arr = finalDrives.slice(); arr[i] = { ...arr[i], ...patch }; onChange({ finalDrives: arr });
  };
  const delFinal = (i: number) => {
    const removed = finalDrives[i];
    const arr = finalDrives.filter((_, k) => k !== i);
    const nextSetups = setups.filter((s) => s.finalDriveId !== removed.id);
    const nextDefault = nextSetups.find((s) => s.id === defaultSetupId) ? defaultSetupId : nextSetups[0]?.id;
    onChange({ finalDrives: arr, setups: nextSetups, defaultSetupId: nextDefault });
  };

  // -- Tire actions
  const addTire = () => {
    const t: TireDef = { id: uid(), name: `Reifen ${tires.length + 1}`, spec: "225/45R17" };
    onChange({ tires: [...tires, t] });
  };
  const updateTire = (i: number, patch: Partial<TireDef>) => {
    const arr = tires.slice(); arr[i] = { ...arr[i], ...patch }; onChange({ tires: arr });
  };
  const delTire = (i: number) => {
    const removed = tires[i];
    const arr = tires.filter((_, k) => k !== i);
    const nextSetups = setups.map((s) => s.tireId === removed.id ? { ...s, tireId: undefined } : s);
    onChange({ tires: arr, setups: nextSetups });
  };

  // -- Setup actions
  const addSetup = () => {
    const gb = gearboxDefs[0];
    const fd = finalDrives[0];
    if (!gb || !fd) { alert("Erst mindestens ein Getriebe und eine Endübersetzung anlegen."); return; }
    const t = tires[0];
    const setup: DriveSetup = {
      id: uid(),
      name: `${gb.name} + ${fd.name}${t ? " + " + t.name : ""}`,
      gearboxId: gb.id,
      finalDriveId: fd.id,
      tireId: t?.id,
    };
    const next = [...setups, setup];
    onChange({ setups: next, defaultSetupId: defaultSetupId ?? setup.id });
  };
  const updateSetup = (i: number, patch: Partial<DriveSetup>) => {
    const arr = setups.slice(); arr[i] = { ...arr[i], ...patch }; onChange({ setups: arr });
  };
  const delSetup = (i: number) => {
    const removed = setups[i];
    const arr = setups.filter((_, k) => k !== i);
    const nextDefault = defaultSetupId === removed.id ? arr[0]?.id : defaultSetupId;
    onChange({ setups: arr, defaultSetupId: nextDefault });
  };

  return (
    <Collapsible
      title="Antrieb (Getriebe, Endübersetzung, Reifen, Setups)"
      persistKey="vehicleEditor.drive"
      defaultOpen
      subtitle={`${gearboxDefs.length} Getriebe · ${finalDrives.length} Endübersetzungen · ${tires.length} Reifen · ${setups.length} Setups`}
    >
      <p className="text-[10px] text-muted-foreground">Getriebe (nur Gänge), Endübersetzungen und Reifen getrennt pflegen und beliebig zu Setups kombinieren.</p>

      {/* Gearboxes */}
      <GearboxesCollapsibleList
        gearboxDefs={gearboxDefs}
        onAdd={addGearbox}
        onUpdate={updateGearbox}
        onDelete={delGearbox}
      />

      {/* Final drives */}
      <Collapsible title="Endübersetzungen" level="sub" persistKey="vehicleEditor.finalDrives" subtitle={`${finalDrives.length} angelegt`}>
        {finalDrives.length === 0 && <p className="text-[11px] text-muted-foreground">Noch keine Endübersetzung.</p>}
        <ul className="space-y-2">
          {finalDrives.map((fd, i) => (
            <li key={fd.id} className="rounded-md border border-border bg-background p-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Field label="Name"><TextInput value={fd.name} onChange={(e) => updateFinal(i, { name: e.target.value })} /></Field>
                <Field label="Übersetzung"><NumInput step="0.001" value={fd.ratio} onChange={(e) => updateFinal(i, { ratio: +e.target.value })} /></Field>
                <div className="flex items-end"><IconButton label="Endübersetzung löschen" onClick={() => delFinal(i)} /></div>
              </div>
            </li>
          ))}
        </ul>
        <AddButton onClick={addFinal}>Endübersetzung</AddButton>
      </Collapsible>

      {/* Tires */}
      <Collapsible title="Reifen" level="sub" persistKey="vehicleEditor.tires" subtitle={`${tires.length} angelegt`}>
        {tires.length === 0 && <p className="text-[11px] text-muted-foreground">Noch kein Reifen.</p>}
        <ul className="space-y-2">
          {tires.map((t, i) => {
            const U = tireCircumferenceM(t.spec);
            return (
              <li key={t.id} className="rounded-md border border-border bg-background p-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Field label="Name"><TextInput value={t.name} onChange={(e) => updateTire(i, { name: e.target.value })} /></Field>
                  <Field label="Spec (z.B. 225/45R17)"><TextInput value={t.spec} onChange={(e) => updateTire(i, { spec: e.target.value })} /></Field>
                  <div className="flex items-end"><IconButton label="Reifen löschen" onClick={() => delTire(i)} /></div>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">Abrollumfang: {U ? (U * 1000).toFixed(0) + " mm (dyn.)" : "– (ungültig)"}</div>
              </li>
            );
          })}
        </ul>
        <AddButton onClick={addTire}>Reifen</AddButton>
      </Collapsible>

      {/* Setups */}
      <Collapsible title="Setups (Getriebe × Endübersetzung × Reifen)" level="sub" persistKey="vehicleEditor.setups" defaultOpen subtitle={`${setups.length} angelegt`}>
        {setups.length === 0 && <p className="text-[11px] text-muted-foreground">Noch kein Setup.</p>}
        <ul className="space-y-2">
          {setups.map((s, i) => {
            const gb = gearboxDefs.find((g) => g.id === s.gearboxId);
            const fd = finalDrives.find((f) => f.id === s.finalDriveId);
            const tire = tires.find((t) => t.id === s.tireId);
            const tireSpec = tire?.spec ?? gb?.tireSpec ?? "";
            const isDefault = defaultSetupId === s.id;
            return (
              <li key={s.id} className="rounded-md border border-border bg-background p-2">
                <div className="flex items-center gap-2">
                  <TextInput className="flex-1" value={s.name} onChange={(e) => updateSetup(i, { name: e.target.value })} />
                  {isDefault ? (
                    <span className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground">Standard</span>
                  ) : (
                    <Button variant="ghost" onClick={() => onChange({ defaultSetupId: s.id })}>als Standard</Button>
                  )}
                  <IconButton label="Setup löschen" onClick={() => delSetup(i)} />
                </div>
                <Row className="mt-2">
                  <Field label="Getriebe">
                    <Select value={s.gearboxId} onChange={(e) => updateSetup(i, { gearboxId: e.target.value })}>
                      {gearboxDefs.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Endübersetzung">
                    <Select value={s.finalDriveId} onChange={(e) => updateSetup(i, { finalDriveId: e.target.value })}>
                      {finalDrives.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.ratio.toFixed(3)})</option>)}
                    </Select>
                  </Field>
                  <Field label="Reifen">
                    <Select value={s.tireId ?? ""} onChange={(e) => updateSetup(i, { tireId: e.target.value || undefined })}>
                      <option value="">– Reifen wählen –</option>
                      {tires.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.spec})</option>)}
                    </Select>
                  </Field>
                </Row>
                {gb && fd && gb.gears.length > 0 && tireSpec && (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    <div className="text-muted-foreground">rpmFactor pro Gang (Reifen {tireSpec}, End {fd.ratio.toFixed(3)}):</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {gb.gears.map((g) => {
                        const f = computeRpmFactor(g.ratio, fd.ratio, tireSpec);
                        if (f == null) return null;
                        return (
                          <button key={g.id} className="rounded bg-muted px-2 py-0.5 hover:bg-secondary"
                            onClick={() => onUseAsDefault(f)}
                            title="Als Standard-rpmFactor setzen">
                            {g.name}: {f.toFixed(2)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {(!tireSpec) && (
                  <p className="mt-2 text-[11px] text-amber-400">Bitte einen Reifen für dieses Setup wählen.</p>
                )}
              </li>
            );
          })}
        </ul>
        <AddButton onClick={addSetup}>Setup</AddButton>
      </Collapsible>
    </Collapsible>

  );
}

function GearboxesCollapsibleList({ gearboxDefs, onAdd, onUpdate, onDelete }: {
  gearboxDefs: GearboxDef[];
  onAdd: () => void;
  onUpdate: (i: number, patch: Partial<GearboxDef>) => void;
  onDelete: (i: number) => void;
}) {
  const [openIds, setOpenIds] = usePersistedState<string[]>("vehicleEditor.openGearboxes", []);
  const toggle = (id: string) => setOpenIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  return (
    <Collapsible title="Getriebe" level="sub" persistKey="vehicleEditor.gearboxes" defaultOpen subtitle={`${gearboxDefs.length} angelegt`}>
      {gearboxDefs.length === 0 && <p className="text-[11px] text-muted-foreground">Noch kein Getriebe.</p>}
      <ul className="space-y-2">
        {gearboxDefs.map((gb, i) => {
          const open = openIds.includes(gb.id);
          return (
            <li key={gb.id} className="rounded-md border border-border bg-background p-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggle(gb.id)}
                  aria-expanded={open}
                  className="flex min-h-[44px] flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight className={`h-4 w-4 flex-none text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
                  <span className="min-w-0 truncate text-sm text-foreground">
                    {gb.name} <span className="ml-1 text-[11px] text-muted-foreground">{gb.gears.length} Gänge</span>
                  </span>
                </button>
                <IconButton label="Getriebe löschen" onClick={() => onDelete(i)} />
              </div>
              {open && (
                <>
                  <div className="mt-2">
                    <Field label="Name"><TextInput value={gb.name} onChange={(e) => onUpdate(i, { name: e.target.value })} /></Field>
                  </div>
                  <GearListEditor
                    gears={gb.gears}
                    onChange={(gears) => onUpdate(i, { gears })}
                  />
                </>
              )}
            </li>
          );
        })}
      </ul>
      <AddButton onClick={onAdd}>Getriebe</AddButton>
    </Collapsible>
  );
}

function GearListEditor({ gears, onChange }: { gears: GearRatio[]; onChange: (g: GearRatio[]) => void }) {
  const add = () => {
    const n = gears.length + 1;
    onChange([...gears, { id: uid(), name: `${n}. Gang`, ratio: 1 }]);
  };
  const update = (i: number, patch: Partial<GearRatio>) => {
    const arr = gears.slice(); arr[i] = { ...arr[i], ...patch }; onChange(arr);
  };
  const del = (i: number) => onChange(gears.filter((_, k) => k !== i));

  return (
    <div className="mt-2">
      {gears.length === 0 && <p className="text-[11px] text-muted-foreground">Noch keine Gänge.</p>}
      <ul className="space-y-2">
        {gears.map((g, i) => (
          <li key={g.id} className="rounded-md border border-border bg-muted/40 p-2">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Field label="Name">
                <TextInput value={g.name} onChange={(e) => update(i, { name: e.target.value })} />
              </Field>
              <div className="flex items-end">
                <IconButton label="Gang löschen" onClick={() => del(i)} />
              </div>
            </div>
            <div className="mt-2">
              <Field label="Übersetzung" hint="z.B. 3.462">
                <NumInput inputMode="decimal" value={g.ratio} onChange={(e) => update(i, { ratio: +e.target.value })} />
              </Field>
            </div>
          </li>
        ))}
      </ul>
      <AddButton onClick={add}>Gang</AddButton>
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

// ================= Schaltdiagramm-Vergleich (im Fahrzeugdialog) =================
function ShiftDiagramCompare({ vehicle }: { vehicle: Vehicle }) {
  const { setups } = normalizeDrive(vehicle);
  const [selected, setSelected] = usePersistedState<string[] | null>(`vehicleEditor.shiftSetups.${vehicle.id}`, null);
  const effective = selected ?? setups.map((s) => s.id);

  const resolved = resolveAllGears(vehicle).filter((r) => effective.includes(r.setupId));
  const maxRpm = vehicle.maxRpm && vehicle.maxRpm > 0 ? vehicle.maxRpm : 8000;
  const shiftRpm = vehicle.shiftRpm && vehicle.shiftRpm > 0 ? vehicle.shiftRpm : undefined;
  const setupIds = Array.from(new Set(resolved.map((r) => r.setupId)));
  const baseColors = ["#38bdf8", "#f472b6", "#a3e635", "#fbbf24", "#c084fc", "#f97316"];

  const series: Series[] = [];
  // maximale km/h für horizontale Referenzlinien
  let kmhMax = 0;

  setupIds.forEach((sid, setupIdx) => {
    // Gänge dieses Setups in Gang-Reihenfolge (höchster rpmFactor zuerst = 1. Gang).
    const gears = resolved
      .filter((r) => r.setupId === sid)
      .slice()
      .sort((a, b) => b.rpmFactor - a.rpmFactor);
    if (gears.length === 0) return;
    const color = baseColors[setupIdx % baseColors.length];
    const setupName = gears[0].setupName;

    // Eine durchgehende Sägezahn-Kurve: pro Gang Anstieg 0→shiftRpm
    // (bzw. maxRpm im letzten Gang), dann senkrechter Sprung auf die
    // Drehzahl des nächsten Gangs bei gleicher km/h.
    const pts: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
    gears.forEach((r, gi) => {
      const isLast = gi === gears.length - 1;
      const rpmTop = isLast ? maxRpm : (shiftRpm ?? maxRpm);
      const kmhTop = rpmTop / r.rpmFactor;
      if (kmhTop > kmhMax) kmhMax = kmhTop;
      pts.push({ x: kmhTop, y: rpmTop });
      const next = gears[gi + 1];
      if (next && !isLast) {
        const rpmNext = rpmTop * (next.rpmFactor / r.rpmFactor);
        pts.push({ x: kmhTop, y: rpmNext });
      }
    });
    series.push({ label: setupName, color, points: pts });
  });


  // Horizontale Referenzlinien (Schalt-/Maximaldrehzahl) über die volle x-Breite.
  if (kmhMax > 0) {
    if (shiftRpm) {
      series.push({
        label: "Schaltdrehzahl",
        color: "#f59e0b",
        points: [{ x: 0, y: shiftRpm }, { x: kmhMax, y: shiftRpm }],
      });
    }
    if (vehicle.maxRpm && vehicle.maxRpm > 0) {
      series.push({
        label: "Maximaldrehzahl",
        color: "#ef4444",
        points: [{ x: 0, y: vehicle.maxRpm }, { x: kmhMax, y: vehicle.maxRpm }],
      });
    }
  }

  return (
    <Collapsible
      title="Schaltdiagramm (Setups vergleichen)"
      persistKey="vehicleEditor.shiftDiagram"
      subtitle={`${effective.length} von ${setups.length} Setups aktiv`}
    >
      <p className="text-[10px] text-muted-foreground">
        U/min über km/h je Gang. Senkrechte Linien zeigen den Drehzahlabfall beim Schalten (bei gepflegter Schaltdrehzahl); waagerechte Linien markieren Schalt- (orange) und Maximaldrehzahl (rot).
      </p>
      {setups.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Erst mindestens ein Setup oben anlegen.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-foreground">
            {setups.map((s) => {
              const on = effective.includes(s.id);
              return (
                <label key={s.id} className="flex min-h-[36px] items-center gap-1.5 rounded-md bg-muted px-2 py-1">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => {
                      const base = effective;
                      const next = e.target.checked
                        ? Array.from(new Set([...base, s.id]))
                        : base.filter((x) => x !== s.id);
                      setSelected(next);
                    }}
                  />
                  {s.name}
                </label>
              );
            })}
          </div>
          <div className="mt-2">
            <Chart
              series={series}
              xLabel="km/h"
              yLabel="U/min"
              xFormat={(v) => v.toFixed(0)}
              yFormat={(v) => v.toFixed(0)}
              height={280}
            />
          </div>
        </>
      )}
    </Collapsible>
  );
}


// Hex-Farbe um einen Faktor aufhellen/abdunkeln (−1..+1).
function shadeColor(hex: string, amount: number): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return hex;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const adj = (c: number) => {
    const t = amount < 0 ? 0 : 255;
    const p = Math.abs(amount);
    return Math.round((t - c) * p + c);
  };
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${toHex(adj(r))}${toHex(adj(g))}${toHex(adj(b))}`;
}
