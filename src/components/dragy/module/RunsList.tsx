import { useMemo, useState } from "react";
import { Section, Field, TextInput, TextArea, NumInput, Select, Button, Note, Row, EmptyState, usePersistedState } from "../ui";
import { useAppStore, pickColor } from "@/lib/dragy/store";
import {
  autoDetectSegments, computeSegment, splitTime, distanceRun, runDistance,
  coastdownFit, autoDetectCoastdown, W_TO_PS,
} from "@/lib/dragy/physics";
import { computeRpmFactor, resolveAllGears } from "@/lib/dragy/gear";
import { uid } from "@/lib/dragy/db";
import type { ModuleId, Session, Segment, Vehicle } from "@/lib/dragy/types";
import { MODULE_IDS, MODULE_LABEL, isPowerModule, isTrackModule, sessionModule } from "@/lib/dragy/modules";
import { Chart, type Series } from "../Chart";

const ACCEL_SPLITS: Array<[number, number]> = [[0, 100], [100, 200], [60, 130], [80, 120]];

export function RunsList({ module, onOpenGarage }: { module: ModuleId; onOpenGarage?: () => void }) {
  const { state, saveSession, deleteSession, saveSegment, deleteSegment } = useAppStore();
  const activeVehicle = state.vehicles.find((v) => v.id === state.activeVehicleId);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!activeVehicle) {
    return (
      <Section title="Sessions & Läufe">
        <EmptyState title="Kein aktives Fahrzeug" description="Wähle oben ein Fahrzeug oder lege eines in der Garage an." actionLabel="Zur Garage" onAction={onOpenGarage} />
      </Section>
    );
  }

  const sessions = state.sessions
    .filter((s) => s.vehicleId === activeVehicle.id && sessionModule(s) === module)
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <Section title={`Sessions – ${MODULE_LABEL[module]}`} note={activeVehicle.name}>
      {sessions.length === 0 && (
        <p className="text-caption text-muted-foreground">
          Noch keine Sessions in diesem Modul. Über „Aufnehmen“ importieren oder live aufzeichnen.
        </p>
      )}

      <ul className="space-y-2">
        {sessions.map((s) => {
          const segs = state.segments.filter((g) => g.sessionId === s.id);
          const isOpen = expanded === s.id;
          const dur = s.records.length ? s.records[s.records.length - 1].t : 0;
          return (
            <li key={s.id} className="rounded-md border border-border bg-muted">
              <button className="flex w-full items-center justify-between p-3 text-left" onClick={() => setExpanded(isOpen ? null : s.id)}>
                <div>
                  <div className="text-body font-medium text-foreground">
                    {s.name} {s.manual && <span className="ml-1 rounded bg-warning px-1 text-caption text-warning-foreground">manuell</span>}
                  </div>
                  <div className="text-caption text-muted-foreground">{dur.toFixed(1)} s · {s.records.length} Punkte · {segs.length} Lauf/Läufe</div>
                </div>
                <span className="text-muted-foreground">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                <SessionDetail
                  module={module}
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
  );
}

function SessionDetail({ module, session, segments, vehicle, onRename, onDelete, onSaveSeg, onDelSeg, onEnvUpdate }: {
  module: ModuleId;
  session: Session; segments: Segment[]; vehicle: Vehicle;
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
    <div className="border-t border-border p-3">
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

      <details className="mt-2 rounded-md border border-border bg-card/50">
        <summary className="cursor-pointer select-none px-3 py-2 text-caption font-semibold text-muted-foreground">Erweitert</summary>
        <div className="space-y-2 p-3">
          <Field
            label="Gewicht für diese Session (kg)"
            hint={`Optional. Leer = Fahrzeug-Standard (${vehicle.mass} kg). Wirkt auf Leistung, Drehmoment und Kalibrierung.`}
          >
            <NumInput
              value={session.massOverride ?? ""}
              placeholder={`${vehicle.mass}`}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "" || raw == null) { onEnvUpdate({ massOverride: undefined }); return; }
                const n = +raw;
                onEnvUpdate({ massOverride: Number.isFinite(n) && n > 0 ? n : undefined });
              }}
            />
          </Field>
          <Field label="Modul dieser Session verschieben" hint="Session in ein anderes Modul umhängen">
            <Select value={module} onChange={(e) => onEnvUpdate({ module: e.target.value as ModuleId })}>
              {MODULE_IDS.map((m) => <option key={m} value={m}>{MODULE_LABEL[m]}</option>)}
            </Select>
          </Field>
        </div>
      </details>

      <div className="mt-2">
        <Chart series={speedSeries} bands={bands} xLabel="t (s)" yLabel="km/h" xFormat={(v) => v.toFixed(1)} yFormat={(v) => v.toFixed(0)} />
      </div>

      {isPowerModule(module) && (
        <>
          <SessionCurves session={session} segments={segments} vehicle={vehicle} />
          <PeakOverview session={session} segments={segments} vehicle={vehicle} />
        </>
      )}
      {module === "accel" && <AccelOverview session={session} segments={segments} />}
      {isTrackModule(module) && <TrackOverview session={session} segments={segments} />}

      <div className="mt-3 rounded-md border border-border p-3">
        <div className="text-caption font-semibold text-foreground">Auto-Erkennung (Vorschlag, danach prüfen)</div>
        <Note>Sucht rückwärts von Zielgeschwindigkeit zum tiefsten Punkt des vorangegangenen Anstiegs.</Note>
        <Row className="mt-2">
          <Field label="Start ≈ (km/h)"><NumInput value={autoStart} onChange={(e) => setAutoStart(+e.target.value)} /></Field>
          <Field label="Ziel ≈ (km/h)"><NumInput value={autoTarget} onChange={(e) => setAutoTarget(+e.target.value)} /></Field>
          <Field label="Min. Anstieg (km/h)"><NumInput value={autoMin} onChange={(e) => setAutoMin(+e.target.value)} /></Field>
        </Row>
        <Button className="mt-2" variant="secondary" onClick={doAutoDetect}>Läufe erkennen</Button>
      </div>

      <div className="mt-3">
        <h4 className="mb-1 text-body font-semibold text-foreground">Läufe</h4>
        <ul className="space-y-2">
          {segments.map((g) => (
            <SegmentEditor
              key={g.id} module={module} seg={g} session={session} vehicle={vehicle}
              maxT={session.records[session.records.length - 1]?.t ?? 0}
              onChange={async (patch) => { await onSaveSeg({ ...g, ...patch }); }}
              onDelete={async () => { if (confirm(`Lauf "${g.name}" löschen?`)) await onDelSeg(g.id); }}
            />
          ))}
        </ul>
        <div className="mt-2">
          <Button variant="secondary" onClick={addSegment}>+ Lauf</Button>
        </div>
      </div>
    </div>
  );
}

function SegmentEditor({ module, seg, session, vehicle, maxT, onChange, onDelete }: {
  module: ModuleId; seg: Segment; session: Session; vehicle: Vehicle; maxT: number;
  onChange: (patch: Partial<Segment>) => Promise<void>; onDelete: () => void;
}) {
  const legacyPresets: Array<{ id: string; name: string; rpmFactor: number }> = (vehicle as any)?.gearPresets ?? [];
  type GearOpt = { id: string; label: string; rpmFactor: number };

  const resolved = resolveAllGears(vehicle);
  const bySetup = new Map<string, { name: string; options: GearOpt[] }>();
  for (const r of resolved) {
    if (!bySetup.has(r.setupId)) bySetup.set(r.setupId, { name: r.setupName, options: [] });
    bySetup.get(r.setupId)!.options.push({ id: `${r.setupId}:${r.gear.id}`, label: r.gear.name, rpmFactor: r.rpmFactor });
  }
  const gearboxGroups = Array.from(bySetup.values());

  if (gearboxGroups.length === 0 && (vehicle as any)?.gearbox) {
    const gb = (vehicle as any).gearbox;
    const options: GearOpt[] = [];
    for (const g of gb.gears ?? []) {
      const f = computeRpmFactor(g.ratio ?? 0, gb.finalDrive ?? 0, gb.tireSpec ?? "");
      if (f && f > 0) options.push({ id: `legacy:${g.id}`, label: g.name, rpmFactor: f });
    }
    if (options.length > 0) gearboxGroups.push({ name: "Getriebe", options });
  }

  const flatGearOptions: GearOpt[] = gearboxGroups.flatMap((g) => g.options);
  const hasAny = flatGearOptions.length + legacyPresets.length > 0;
  const isPower = isPowerModule(module);

  const miniSeries: Series[] = useMemo(() => {
    if (isPower) {
      const samples = computeSegment(session, seg, vehicle);
      const points = samples
        .map((s) => ({ x: s.rpm, y: s.pEngineW * W_TO_PS }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      return [{ label: seg.name, color: seg.color, points }];
    }
    const points = session.records
      .filter((r) => r.t >= seg.startT && r.t <= seg.endT)
      .map((r) => ({ x: r.t - seg.startT, y: r.speedKmh }));
    return [{ label: seg.name, color: seg.color, points }];
  }, [session, seg, vehicle, isPower]);

  return (
    <li className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-caption text-muted-foreground">
          <input type="checkbox" checked={seg.visible} onChange={(e) => onChange({ visible: e.target.checked })} />
          sichtbar
        </label>
        <label className="relative h-6 w-6 flex-none cursor-pointer rounded border border-input" style={{ backgroundColor: seg.color }} title="Farbe ändern">
          <input type="color" value={seg.color} onChange={(e) => onChange({ color: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Farbe wählen" />
        </label>
        <TextInput className="flex-1" value={seg.name} onChange={(e) => onChange({ name: e.target.value })} />
        <Button variant="danger" onClick={onDelete}>×</Button>
      </div>
      <Row className="mt-2">
        <Field label="Start t (s)"><NumInput step="0.1" value={seg.startT} onChange={(e) => onChange({ startT: Math.max(0, +e.target.value) })} /></Field>
        <Field label="Ende t (s)"><NumInput step="0.1" value={seg.endT} onChange={(e) => onChange({ endT: Math.min(maxT, +e.target.value) })} /></Field>

        {isPower && hasAny && (
          <Field label="Gemessener Gang" hint="Setzt rpmFactor aus Fahrzeug-Getriebe/Preset">
            <Select
              value={seg.gearPresetId ?? ""}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) { onChange({ gearPresetId: undefined }); return; }
                const p = [...flatGearOptions, ...legacyPresets.map((lp) => ({ id: lp.id, label: lp.name, rpmFactor: lp.rpmFactor }))].find((x) => x.id === id);
                if (p) onChange({ gearPresetId: id, rpmFactor: +p.rpmFactor.toFixed(3) });
              }}
            >
              <option value="">– manuell –</option>
              {gearboxGroups.map((grp) => (
                <optgroup key={grp.name} label={grp.name}>
                  {grp.options.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.rpmFactor.toFixed(2)})</option>)}
                </optgroup>
              ))}
              {legacyPresets.length > 0 && (
                <optgroup label="Presets">
                  {legacyPresets.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.rpmFactor.toFixed(2)})</option>)}
                </optgroup>
              )}
            </Select>
          </Field>
        )}

        {isPower && (
          <Field label="rpmFactor (U/min pro km/h)" hint="Manuell überschreibbar">
            <NumInput step="0.01" value={seg.rpmFactor} onChange={(e) => onChange({ rpmFactor: +e.target.value, gearPresetId: undefined })} />
          </Field>
        )}
      </Row>

      <div className="mt-2">
        <Field label="Notizen zum Lauf" hint="z.B. Gang, Bedingungen, Auffälligkeiten">
          <TextArea rows={2} value={seg.notes ?? ""} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Notizen…" />
        </Field>
      </div>

      {isPower && <CoastdownPanel session={session} seg={seg} vehicle={vehicle} onChange={onChange} />}

      {isPower && (
        <div className="mt-2 flex justify-end">
          <Button variant="secondary" onClick={() => setPdfOpen(true)}>PDF-Protokoll</Button>
        </div>
      )}
      {pdfOpen && (
        <PdfExportDialog runs={[{ session, segment: seg, vehicle }]} onClose={() => setPdfOpen(false)} />
      )}

      <div className="mt-2">
        <div className="mb-1 text-caption font-semibold text-muted-foreground">
          {isPower ? "Leistung (PS) über Drehzahl" : "Geschwindigkeit (km/h) über Zeit"}
        </div>
        <Chart
          series={miniSeries}
          height={160}
          xLabel={isPower ? "U/min" : "t (s)"}
          yLabel={isPower ? "PS" : "km/h"}
          xFormat={(v) => v.toFixed(isPower ? 0 : 1)}
          yFormat={(v) => v.toFixed(0)}
        />
      </div>
    </li>
  );
}

/** Coastdown direkt am Lauf: Fahrwiderstände bestimmen und als Lauf- oder Fahrzeugwert setzen. */
function CoastdownPanel({ session, seg, vehicle, onChange }: {
  session: Session; seg: Segment; vehicle: Vehicle; onChange: (patch: Partial<Segment>) => Promise<void>;
}) {
  const { saveVehicle } = useAppStore();
  const [range, setRange] = useState<{ startT: number; endT: number } | null>(null);

  const mass = session.massOverride && session.massOverride > 0 ? session.massOverride : vehicle.mass;
  const fit = useMemo(
    () => (range ? coastdownFit(session, range.startT, range.endT, mass) : null),
    [session, range, mass],
  );

  const detect = () => {
    const d = autoDetectCoastdown(session);
    if (!d) { alert("Keine geeignete Ausrollphase in dieser Session gefunden. Bereich manuell eingeben."); setRange({ startT: seg.startT, endT: seg.endT }); return; }
    setRange({ startT: +d.startT.toFixed(2), endT: +d.endT.toFixed(2) });
  };

  return (
    <details className="mt-2 rounded-md border border-border bg-card/50">
      <summary className="cursor-pointer select-none px-3 py-2 text-caption font-semibold text-muted-foreground">
        Fahrwiderstände (Coastdown)
        {seg.calibration ? " · eigener Wert" : " · Fahrzeug-Standard"}
      </summary>
      <div className="p-3">
        <Note>
          Ohne eigene Kalibrierung gelten die Fahrzeug-Standardwerte (Crr {vehicle.crr}, Cd·A {(vehicle.cd * vehicle.area).toFixed(3)}).
          Für eine Messung eine Ausrollphase (ausgekuppelt, ebene Strecke, kein Wind) wählen.
        </Note>
        {seg.calibration && (
          <div className="mt-2 text-caption text-foreground">
            Lauf-Kalibrierung: Crr {seg.calibration.crr.toFixed(4)} · Cd·A {seg.calibration.cdA.toFixed(3)}
            <button className="ml-2 text-destructive underline" onClick={() => onChange({ calibration: undefined })}>entfernen</button>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={detect}>Ausrollphase erkennen</Button>
          {range && <Button variant="secondary" onClick={() => setRange(null)}>zurücksetzen</Button>}
        </div>
        {range && (
          <>
            <Row className="mt-2">
              <Field label="Start t (s)"><NumInput step="0.1" value={range.startT} onChange={(e) => setRange({ ...range, startT: Math.max(0, +e.target.value) })} /></Field>
              <Field label="Ende t (s)"><NumInput step="0.1" value={range.endT} onChange={(e) => setRange({ ...range, endT: +e.target.value })} /></Field>
            </Row>
            <div className="mt-2">
              <Chart
                series={[{ label: "km/h", color: "#38bdf8", points: session.records.map((r) => ({ x: r.t, y: r.speedKmh })) }]}
                bands={[{ xStart: range.startT, xEnd: range.endT, color: "#f59e0b", label: "Coastdown" }]}
                height={160} xLabel="t (s)" yLabel="km/h" xFormat={(v) => v.toFixed(1)} yFormat={(v) => v.toFixed(0)}
              />
            </div>
            {fit && (
              <div className="mt-2 rounded-md border border-border p-3 text-caption text-foreground">
                <div>Crr: <b>{fit.crr.toFixed(5)}</b></div>
                <div>Cd·A: <b>{fit.cdA.toFixed(3)}</b> m² (→ Cd ≈ {(fit.cdA / vehicle.area).toFixed(3)} bei A={vehicle.area})</div>
                <div>R²: <b>{fit.r2.toFixed(3)}</b> ({fit.n} Punkte)</div>
                {fit.r2 < 0.85 && <p className="mt-1 text-warning">R² &lt; 0.85 – möglicherweise Gefälle/Wind im Abschnitt.</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => onChange({ calibration: { crr: fit.crr, cdA: fit.cdA } })}>Nur für diesen Lauf</Button>
                  <Button onClick={async () => {
                    await saveVehicle({ ...vehicle, crr: +fit.crr.toFixed(5), cd: +(fit.cdA / vehicle.area).toFixed(4), calibrated: true });
                    alert("Fahrzeug-Standard aktualisiert.");
                  }}>Als Fahrzeug-Standard</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}

function PeakOverview({ session, segments, vehicle }: { session: Session; segments: Segment[]; vehicle: Vehicle }) {
  const [refId, setRefId] = usePersistedState<string>(`dragy.peaks.ref.${session.id}`, "");

  const rows = useMemo(() => segments.map((g) => {
    const samples = computeSegment(session, g, vehicle);
    const best = { ps: NaN, psRpm: NaN, nm: NaN, nmRpm: NaN };
    for (const s of samples) {
      const ps = s.pEngineW * W_TO_PS;
      if (Number.isFinite(ps) && (!Number.isFinite(best.ps) || ps > best.ps)) { best.ps = ps; best.psRpm = s.rpm; }
      const nm = s.torqueEngineNm;
      if (Number.isFinite(nm) && (!Number.isFinite(best.nm) || nm > best.nm)) { best.nm = nm; best.nmRpm = s.rpm; }
    }
    return { id: g.id, name: g.name, color: g.color, ...best };
  }), [session, segments, vehicle]);

  if (rows.length === 0) return null;

  const ref = rows.find((r) => r.id === refId);
  const delta = (val: number, base: number) => {
    if (!Number.isFinite(val) || !Number.isFinite(base) || base === 0) return null;
    const abs = val - base;
    return { abs, pct: (abs / base) * 100 };
  };
  const fmtDelta = (d: { abs: number; pct: number } | null, unit: string, digits = 0) => {
    if (!d) return "—";
    const sign = d.abs > 0 ? "+" : "";
    const cls = d.abs > 0.05 ? "text-emerald-400" : d.abs < -0.05 ? "text-destructive" : "text-muted-foreground";
    return <span className={cls}>{sign}{d.abs.toFixed(digits)} {unit} ({sign}{d.pct.toFixed(1)} %)</span>;
  };

  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <div className="text-caption font-semibold text-foreground">Spitzenwerte je Lauf (Motor, geschätzt)</div>
      <Note>Maximale Motorleistung/-drehmoment mit zugehöriger Drehzahl. Referenzlauf wählen, um Abweichungen zu sehen.</Note>
      <div className="mt-2">
        <Field label="Referenzlauf">
          <Select value={refId} onChange={(e) => setRefId(e.target.value)}>
            <option value="">– keine Referenz –</option>
            {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-caption text-foreground">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 text-left font-medium">Lauf</th>
              <th className="py-1 pr-2 text-right font-medium">Peak PS</th>
              <th className="py-1 pr-2 text-right font-medium">@ U/min</th>
              {ref && <th className="py-1 pr-2 text-right font-medium">Δ PS</th>}
              <th className="py-1 pr-2 text-right font-medium">Peak Nm</th>
              <th className="py-1 pr-2 text-right font-medium">@ U/min</th>
              {ref && <th className="py-1 pr-2 text-right font-medium">Δ Nm</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-border ${r.id === refId ? "bg-secondary/40" : ""}`}>
                <td className="py-1 pr-2">
                  <span className="mr-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ backgroundColor: r.color }} />
                  {r.name}{r.id === refId && <span className="ml-1 text-caption text-muted-foreground">(Ref)</span>}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.ps) ? r.ps.toFixed(0) : "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.psRpm) ? r.psRpm.toFixed(0) : "—"}</td>
                {ref && <td className="py-1 pr-2 text-right tabular-nums">{r.id === refId ? "—" : fmtDelta(delta(r.ps, ref.ps), "PS")}</td>}
                <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.nm) ? r.nm.toFixed(0) : "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.nmRpm) ? r.nmRpm.toFixed(0) : "—"}</td>
                {ref && <td className="py-1 pr-2 text-right tabular-nums">{r.id === refId ? "—" : fmtDelta(delta(r.nm, ref.nm), "Nm")}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type CurveMode = "pEngine" | "tqEngine" | "pWheel";
const CURVE_LABEL: Record<CurveMode, string> = {
  pEngine: "Motorleistung (PS)",
  tqEngine: "Motor-Drehmoment (Nm)",
  pWheel: "Radleistung (PS)",
};

function SessionCurves({ session, segments, vehicle }: { session: Session; segments: Segment[]; vehicle: Vehicle }) {
  const [mode, setMode] = usePersistedState<CurveMode>("dragy.session.curveMode", "pEngine");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  const series: Series[] = useMemo(() => segments.map((g) => {
    const samples = computeSegment(session, g, vehicle);
    const points = samples
      .map((s) => {
        const y = mode === "pEngine" ? s.pEngineW * W_TO_PS
          : mode === "pWheel" ? s.pWheelW * W_TO_PS
          : s.torqueEngineNm;
        return { x: s.rpm, y };
      })
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    return { label: g.name, color: g.color, points, visible: !hidden[g.id] };
  }), [segments, session, vehicle, mode, hidden]);

  if (segments.length === 0) return null;

  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <div className="text-caption font-semibold text-foreground">Kurven dieser Session</div>
      <Note>Alle Läufe überlagert. Legende zum Ein-/Ausblenden antippen.</Note>
      <div className="mt-2">
        <Field label="Diagramm">
          <Select value={mode} onChange={(e) => setMode(e.target.value as CurveMode)}>
            {(Object.keys(CURVE_LABEL) as CurveMode[]).map((m) => <option key={m} value={m}>{CURVE_LABEL[m]}</option>)}
          </Select>
        </Field>
      </div>
      <div className="mt-2">
        <Chart
          series={series} height={260} xLabel="U/min" yLabel={mode === "tqEngine" ? "Nm" : "PS"}
          xFormat={(v) => v.toFixed(0)} yFormat={(v) => v.toFixed(0)}
          onLegendToggle={(i) => {
            const g = segments[i]; if (!g) return;
            setHidden((h) => ({ ...h, [g.id]: !h[g.id] }));
          }}
        />
      </div>
    </div>
  );
}

function AccelOverview({ session, segments }: { session: Session; segments: Segment[] }) {
  const rows = useMemo(() => segments.map((g) => ({
    id: g.id, name: g.name, color: g.color,
    splits: ACCEL_SPLITS.map(([a, b]) => splitTime(session.records, g.startT, g.endT, a, b)),
    quarter: distanceRun(session.records, g.startT, g.endT),
    dist: runDistance(session.records, g.startT, g.endT),
  })), [session, segments]);

  if (rows.length === 0) return null;

  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <div className="text-caption font-semibold text-foreground">Beschleunigungs-Ergebnisse</div>
      <Note>Split-Zeiten linear interpoliert, 1/4 Meile über die aufintegrierte GPS-Geschwindigkeit.</Note>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-caption text-foreground">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 text-left font-medium">Lauf</th>
              {ACCEL_SPLITS.map(([a, b]) => <th key={`${a}-${b}`} className="py-1 pr-2 text-right font-medium">{a}–{b}</th>)}
              <th className="py-1 pr-2 text-right font-medium">1/4 Meile</th>
              <th className="py-1 pr-2 text-right font-medium">Trap</th>
              <th className="py-1 pr-2 text-right font-medium">Distanz</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="py-1 pr-2">
                  <span className="mr-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ backgroundColor: r.color }} />
                  {r.name}
                </td>
                {r.splits.map((s, i) => <td key={i} className="py-1 pr-2 text-right tabular-nums">{s != null ? `${s.toFixed(2)} s` : "—"}</td>)}
                <td className="py-1 pr-2 text-right tabular-nums">{r.quarter ? `${r.quarter.seconds.toFixed(2)} s` : "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.quarter ? `${r.quarter.trapKmh.toFixed(0)} km/h` : "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.dist.toFixed(0)} m</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Stage-/Runden-Auswertung: Zeit, Distanz, Ø/Max-Speed und Speed-Trace über Distanz. */
export function TrackOverview({ session, segments }: { session: Session; segments: Segment[] }) {
  const rows = useMemo(() => segments.map((g) => {
    const rec = session.records.filter((r) => r.t >= g.startT && r.t <= g.endT);
    const dur = rec.length ? rec[rec.length - 1].t - rec[0].t : NaN;
    const dist = runDistance(session.records, g.startT, g.endT);
    const vMax = rec.length ? Math.max(...rec.map((r) => r.speedKmh)) : NaN;
    const vAvg = Number.isFinite(dur) && dur > 0 ? (dist / dur) * 3.6 : NaN;
    return { id: g.id, name: g.name, color: g.color, dur, dist, vMax, vAvg };
  }), [session, segments]);

  const series: Series[] = useMemo(() => segments.map((g) => {
    const rec = session.records.filter((r) => r.t >= g.startT && r.t <= g.endT);
    let d = 0;
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < rec.length; i++) {
      if (i > 0) d += ((rec[i].speedKmh + rec[i - 1].speedKmh) / 2 / 3.6) * (rec[i].t - rec[i - 1].t);
      points.push({ x: d, y: rec[i].speedKmh });
    }
    return { label: g.name, color: g.color, points, visible: g.visible };
  }), [session, segments]);

  if (rows.length === 0) return null;
  const best = rows.reduce((a, b) => (Number.isFinite(b.dur) && b.dur < a.dur ? b : a));

  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <div className="text-caption font-semibold text-foreground">Stage-/Runden-Ergebnisse</div>
      <Note>Zeit und Distanz je Lauf; Distanz aus der GPS-Geschwindigkeit integriert. Speed-Trace über die Strecke zum Vergleich der Linien.</Note>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-caption text-foreground">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 text-left font-medium">Lauf</th>
              <th className="py-1 pr-2 text-right font-medium">Zeit</th>
              <th className="py-1 pr-2 text-right font-medium">Δ Best</th>
              <th className="py-1 pr-2 text-right font-medium">Distanz</th>
              <th className="py-1 pr-2 text-right font-medium">Ø km/h</th>
              <th className="py-1 pr-2 text-right font-medium">Max km/h</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="py-1 pr-2">
                  <span className="mr-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ backgroundColor: r.color }} />
                  {r.name}{r.id === best.id && <span className="ml-1 text-emerald-400">★</span>}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.dur) ? `${r.dur.toFixed(2)} s` : "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.id === best.id ? "—" : `+${(r.dur - best.dur).toFixed(2)} s`}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.dist.toFixed(0)} m</td>
                <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.vAvg) ? r.vAvg.toFixed(0) : "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.vMax) ? r.vMax.toFixed(0) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2">
        <Chart series={series} height={220} xLabel="Distanz (m)" yLabel="km/h" xFormat={(v) => v.toFixed(0)} yFormat={(v) => v.toFixed(0)} />
      </div>
    </div>
  );
}
