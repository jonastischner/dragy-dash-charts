import { useMemo, useState } from "react";
import { ArrowLeft, LineChart, Table2, Timer } from "lucide-react";
import { Button, EmptyState, Field, NumInput, Section, Select, TextInput, usePersistedState } from "../ui";
import { useAppStore } from "@/lib/dragy/store";
import { uid } from "@/lib/dragy/db";
import { normalizeDrive } from "@/lib/dragy/gear";
import { simSetupsFromVehicle, type SimSetup } from "@/lib/dragy/gearSim";
import type { DriveSetup, FinalDriveDef } from "@/lib/dragy/types";
import { ShiftDiagram } from "./ShiftDiagram";
import { GearSpeedTable } from "./GearSpeedTable";
import { AccelForecast } from "./AccelForecast";

type View = "diagram" | "table" | "accel";
const VIEWS: Array<{ id: View; label: string; icon: typeof LineChart }> = [
  { id: "diagram", label: "Schaltdiagramm", icon: LineChart },
  { id: "table", label: "Tempo-Tabelle", icon: Table2 },
  { id: "accel", label: "Prognose", icon: Timer },
];

interface TestConfig {
  active: boolean;
  gearboxId: string;
  finalRatio: number;
  tireSpec: string;
}

export function GearSimWorkspace({ onBack, onOpenGarage, onOpenPower }: {
  onBack: () => void;
  onOpenGarage?: () => void;
  onOpenPower?: () => void;
}) {
  const { state, saveVehicle } = useAppStore();
  const vehicle = state.vehicles.find((v) => v.id === state.activeVehicleId);
  const [view, setView] = usePersistedState<View>("dragy.sim.view", "diagram");

  const drive = useMemo(() => normalizeDrive(vehicle), [vehicle]);
  const saved = useMemo(() => simSetupsFromVehicle(vehicle), [vehicle]);

  const [selected, setSelected] = usePersistedState<string[] | null>(
    `dragy.sim.setups.${vehicle?.id ?? "none"}`,
    null,
  );
  const [test, setTest] = useState<TestConfig>({ active: false, gearboxId: "", finalRatio: 3.46, tireSpec: "225/45R17" });

  const effectiveIds = selected ?? saved.map((s) => s.id);
  const testSetup: SimSetup | null = useMemo(() => {
    if (!test.active) return null;
    const gb = drive.gearboxDefs.find((g) => g.id === test.gearboxId) ?? drive.gearboxDefs[0];
    if (!gb || gb.gears.length === 0 || !test.tireSpec) return null;
    return {
      id: "__test",
      name: `Testsetup (${gb.name} · ${test.finalRatio.toFixed(3)} · ${test.tireSpec})`,
      gears: gb.gears,
      finalDrive: test.finalRatio,
      tireSpec: test.tireSpec,
      virtual: true,
    };
  }, [test, drive.gearboxDefs]);

  const activeSetups = useMemo(() => {
    const list = saved.filter((s) => effectiveIds.includes(s.id));
    return testSetup ? [...list, testSetup] : list;
  }, [saved, effectiveIds, testSetup]);

  const adoptTest = async () => {
    if (!vehicle || !testSetup) return;
    const gb = drive.gearboxDefs.find((g) => g.id === (test.gearboxId || drive.gearboxDefs[0]?.id));
    if (!gb) return;
    const finalDrives = [...drive.finalDrives];
    let fd = finalDrives.find((f) => Math.abs(f.ratio - test.finalRatio) < 1e-6);
    if (!fd) {
      fd = { id: uid(), name: test.finalRatio.toFixed(3), ratio: test.finalRatio } as FinalDriveDef;
      finalDrives.push(fd);
    }
    const tires = [...drive.tires];
    let tire = tires.find((t) => t.spec === test.tireSpec);
    if (!tire) {
      tire = { id: uid(), name: test.tireSpec, spec: test.tireSpec };
      tires.push(tire);
    }
    const setup: DriveSetup = {
      id: uid(),
      name: `${gb.name} + ${fd.name} + ${tire.name}`,
      gearboxId: gb.id,
      finalDriveId: fd.id,
      tireId: tire.id,
    };
    await saveVehicle({
      ...vehicle,
      gearboxDefs: drive.gearboxDefs,
      finalDrives,
      tires,
      setups: [...drive.setups, setup],
      defaultSetupId: vehicle.defaultSetupId ?? drive.defaultSetupId,
    });
    setSelected([...effectiveIds, setup.id]);
    setTest({ ...test, active: false });
  };

  return (
    <div>
      <div className="mb-4 flex items-start gap-3">
        <button
          onClick={onBack}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
          aria-label="Zurück zur Übersicht"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-body font-semibold text-foreground">Getriebe-Simulator</h2>
          <p className="text-caption text-muted-foreground">Setups vergleichen und „was wäre wenn“ rechnen – ohne das Fahrzeug zu ändern.</p>
        </div>
      </div>

      {!vehicle ? (
        <Section title="Getriebe-Simulator">
          <EmptyState title="Kein aktives Fahrzeug" description="Wähle oben ein Fahrzeug oder lege eines in der Garage an." actionLabel="Zur Garage" onAction={onOpenGarage} />
        </Section>
      ) : saved.length === 0 && !testSetup ? (
        <Section title="Getriebe-Simulator">
          <EmptyState
            title="Noch keine Setups"
            description="Lege in der Garage Getriebe, Endübersetzung und Reifen an und kombiniere sie zu einem Setup."
            actionLabel="Zur Garage"
            onAction={onOpenGarage}
          />
        </Section>
      ) : (
        <>
          <Section title="Setups auswählen">
            <div className="flex flex-wrap gap-2 text-caption text-foreground">
              {saved.map((s) => {
                const on = effectiveIds.includes(s.id);
                const isCurrent = vehicle.defaultSetupId === s.id || drive.defaultSetupId === s.id;
                return (
                  <label key={s.id} className="flex min-h-[44px] items-center gap-2 rounded-md bg-muted px-3 py-1">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setSelected(e.target.checked
                        ? Array.from(new Set([...effectiveIds, s.id]))
                        : effectiveIds.filter((x) => x !== s.id))}
                    />
                    {s.name}
                    {isCurrent && <span className="rounded bg-primary px-1 text-primary-foreground">aktuell</span>}
                  </label>
                );
              })}
            </div>

            <div className="mt-3 rounded-md border border-dashed border-input p-3">
              <label className="flex min-h-[44px] items-center gap-2 text-caption text-foreground">
                <input type="checkbox" checked={test.active} onChange={(e) => setTest({ ...test, active: e.target.checked, gearboxId: test.gearboxId || drive.gearboxDefs[0]?.id || "" })} />
                Testsetup („was wäre wenn“) mitrechnen – ändert das Fahrzeug nicht
              </label>
              {test.active && (
                <>
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    <Field label="Getriebe">
                      <Select value={test.gearboxId} onChange={(e) => setTest({ ...test, gearboxId: e.target.value })}>
                        {drive.gearboxDefs.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Endübersetzung">
                      <NumInput step="0.001" inputMode="decimal" value={test.finalRatio} onChange={(e) => setTest({ ...test, finalRatio: +e.target.value })} />
                    </Field>
                    <Field label="Reifen (z.B. 225/45R17)">
                      <TextInput value={test.tireSpec} onChange={(e) => setTest({ ...test, tireSpec: e.target.value })} />
                    </Field>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {drive.finalDrives.map((f) => (
                      <Button key={f.id} variant="ghost" onClick={() => setTest({ ...test, finalRatio: f.ratio })}>{f.name} ({f.ratio.toFixed(3)})</Button>
                    ))}
                    {drive.tires.map((t) => (
                      <Button key={t.id} variant="ghost" onClick={() => setTest({ ...test, tireSpec: t.spec })}>{t.spec}</Button>
                    ))}
                  </div>
                  <div className="mt-2">
                    <Button variant="secondary" onClick={adoptTest} disabled={!testSetup}>Als Setup-Variante in die Garage übernehmen</Button>
                  </div>
                </>
              )}
            </div>
          </Section>

          <div role="tablist" aria-label="Simulator-Ansichten" className="mb-4 flex gap-1 rounded-md border border-border bg-muted p-1">
            {VIEWS.map((v) => {
              const Icon = v.icon;
              const active = view === v.id;
              return (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(v.id)}
                  className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded px-3 text-caption font-medium ${
                    active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {v.label}
                </button>
              );
            })}
          </div>

          <Section title={VIEWS.find((v) => v.id === view)!.label}>
            {activeSetups.length === 0 ? (
              <p className="text-caption text-muted-foreground">Mindestens ein Setup auswählen.</p>
            ) : view === "diagram" ? (
              <ShiftDiagram vehicle={vehicle} setups={activeSetups} />
            ) : view === "table" ? (
              <GearSpeedTable vehicle={vehicle} setups={activeSetups} />
            ) : (
              <AccelForecast
                vehicle={vehicle}
                sessions={state.sessions}
                segments={state.segments}
                setups={activeSetups}
                referenceSetupId={vehicle.defaultSetupId ?? drive.defaultSetupId}
                onOpenPower={onOpenPower}
              />
            )}
          </Section>
        </>
      )}
    </div>
  );
}
