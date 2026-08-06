import { useMemo, useState } from "react";
import { Section, Field, TextInput, TextArea, NumInput, Select, Button, Note, Row, EmptyState, usePersistedState } from "./ui";
import { useAppStore, pickColor } from "@/lib/dragy/store";
import { autoDetectSegments, computeSegment, splitTime, distanceRun, runDistance, W_TO_PS } from "@/lib/dragy/physics";
import { computeRpmFactor, resolveAllGears } from "@/lib/dragy/gear";
import { uid } from "@/lib/dragy/db";
import type { Session, Segment, RunCategory } from "@/lib/dragy/types";
import { RUN_CATEGORY_LABEL, RUN_CATEGORY_SHORT, SESSION_KIND_LABEL, categoriesFor, defaultCategoryFor, hasPowerCurve, runCategory, sessionKind } from "@/lib/dragy/categories";
import { Chart, type Series } from "./Chart";

const ACCEL_SPLITS: Array<[number, number]> = [[0, 100], [100, 200], [60, 130], [80, 120]];


export function SessionsTab({ onOpenVehicles }: { onOpenVehicles?: () => void } = {}) {
  const { state, saveSession, deleteSession, saveSegment, deleteSegment } = useAppStore();
  const activeVehicle = state.vehicles.find((v) => v.id === state.activeVehicleId);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!activeVehicle) return <Section title="Sessions & Läufe"><EmptyState title="Kein aktives Fahrzeug" description="Lege zuerst ein Fahrzeug an und aktiviere es." actionLabel="Zu Fahrzeuge" onAction={onOpenVehicles} /></Section>;


  const sessions = state.sessions.filter((s) => s.vehicleId === activeVehicle.id).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div>
      <AllSessionsPeaks sessions={sessions} segments={state.segments} vehicle={activeVehicle} />
      <Section title={`Sessions – ${activeVehicle.name}`}>

        {sessions.length === 0 && <p className="text-caption text-muted-foreground">Noch keine Sessions. Reiter „Import" nutzen.</p>}
        <ul className="space-y-2">
          {sessions.map((s) => {
            const segs = state.segments.filter((g) => g.sessionId === s.id);
            const isOpen = expanded === s.id;
            const dur = s.records.length ? s.records[s.records.length - 1].t : 0;
            return (
              <li key={s.id} className="rounded-md border border-border bg-muted">
                <button className="flex w-full items-center justify-between p-3 text-left" onClick={() => setExpanded(isOpen ? null : s.id)}>
                  <div>
                    <div className="text-body font-medium text-foreground">{s.name} {s.manual && <span className="ml-1 rounded bg-warning text-warning-foreground px-1 text-caption">manuell</span>}</div>
                    <div className="text-caption text-muted-foreground">{dur.toFixed(1)} s · {s.records.length} Punkte · {segs.length} Lauf/Läufe</div>
                  </div>
                  <span className="text-muted-foreground">{isOpen ? "▾" : "▸"}</span>
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
function bestOfSegments(session: Session, segs: Segment[], vehicle: any) {
  let best: { segId: string; segName: string; color: string; ps: number; psRpm: number; nm: number; nmRpm: number } | null = null;
  for (const g of segs) {
    const samples = computeSegment(session, g, vehicle);
    let ps = NaN, psRpm = NaN, nm = NaN, nmRpm = NaN;
    for (const s of samples) {
      const p = s.pEngineW * W_TO_PS;
      if (Number.isFinite(p) && (!Number.isFinite(ps) || p > ps)) { ps = p; psRpm = s.rpm; }
      const t = s.torqueEngineNm;
      if (Number.isFinite(t) && (!Number.isFinite(nm) || t > nm)) { nm = t; nmRpm = s.rpm; }
    }
    if (!Number.isFinite(ps)) continue;
    if (!best || ps > best.ps) best = { segId: g.id, segName: g.name, color: g.color, ps, psRpm, nm, nmRpm };
  }
  return best;
}

function AllSessionsPeaks({ sessions, segments, vehicle }: { sessions: Session[]; segments: Segment[]; vehicle: any }) {
  const [refKey, setRefKey] = usePersistedState<string>(`dragy.peaks.globalRef.${vehicle.id}`, "");

  const rows = useMemo(() => {
    return sessions.map((s) => {
      const segs = segments.filter((g) => g.sessionId === s.id);
      return { session: s, best: bestOfSegments(s, segs, vehicle) };
    }).filter((r) => r.best);
  }, [sessions, segments, vehicle]);

  if (rows.length === 0) return null;

  const strongest = rows.reduce((a, b) => (b.best!.ps > a.best!.ps ? b : a));
  const ref = rows.find((r) => `${r.session.id}:${r.best!.segId}` === refKey);

  const fmtDelta = (val: number, base: number, unit: string) => {
    if (!Number.isFinite(val) || !Number.isFinite(base) || base === 0) return "—";
    const abs = val - base;
    const pct = (abs / base) * 100;
    const sign = abs > 0 ? "+" : "";
    const cls = abs > 0.05 ? "text-emerald-400" : abs < -0.05 ? "text-red-400" : "text-muted-foreground";
    return <span className={cls}>{sign}{abs.toFixed(0)} {unit} ({sign}{pct.toFixed(1)} %)</span>;
  };

  return (
    <Section title="Stärkster Lauf je Session">
      <Note>Pro Session wird der Lauf mit der höchsten geschätzten Motorleistung gezeigt. Ein Lauf kann session-übergreifend als Referenz gesetzt werden.</Note>
      <div className="mt-2">
        <Field label="Referenzlauf (session-übergreifend)">
          <select
            className="w-full rounded-md border border-input bg-muted px-3 py-3 text-body text-foreground focus:border-ring focus:outline-none"
            value={refKey}
            onChange={(e) => setRefKey(e.target.value)}
          >
            <option value="">– keine Referenz –</option>
            {rows.map((r) => (
              <option key={r.session.id} value={`${r.session.id}:${r.best!.segId}`}>
                {r.session.name} – {r.best!.segName}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-caption text-foreground">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 text-left font-medium">Session</th>
              <th className="py-1 pr-2 text-left font-medium">Bester Lauf</th>
              <th className="py-1 pr-2 text-right font-medium">Peak PS</th>
              <th className="py-1 pr-2 text-right font-medium">@ U/min</th>
              {ref && <th className="py-1 pr-2 text-right font-medium">Δ PS</th>}
              <th className="py-1 pr-2 text-right font-medium">Peak Nm</th>
              <th className="py-1 pr-2 text-right font-medium">@ U/min</th>
              {ref && <th className="py-1 pr-2 text-right font-medium">Δ Nm</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = `${r.session.id}:${r.best!.segId}`;
              const isRef = key === refKey;
              return (
                <tr key={r.session.id} className={`border-t border-border ${isRef ? "bg-secondary/40" : ""}`}>
                  <td className="py-1 pr-2">
                    {r.session.name}
                    {r.session.id === strongest.session.id && <span className="ml-1 text-caption text-emerald-400">★ stärkste</span>}
                    {isRef && <span className="ml-1 text-caption text-muted-foreground">(Ref)</span>}
                  </td>
                  <td className="py-1 pr-2">
                    <span className="mr-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ backgroundColor: r.best!.color }} />
                    {r.best!.segName}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">{r.best!.ps.toFixed(0)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.best!.psRpm) ? r.best!.psRpm.toFixed(0) : "—"}</td>
                  {ref && <td className="py-1 pr-2 text-right tabular-nums">{isRef ? "—" : fmtDelta(r.best!.ps, ref.best!.ps, "PS")}</td>}
                  <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.best!.nm) ? r.best!.nm.toFixed(0) : "—"}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.best!.nmRpm) ? r.best!.nmRpm.toFixed(0) : "—"}</td>
                  {ref && <td className="py-1 pr-2 text-right tabular-nums">{isRef ? "—" : fmtDelta(r.best!.nm, ref.best!.nm, "Nm")}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
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

  const kind = sessionKind(session);
  const defCat = defaultCategoryFor(kind);

  const addSegment = async () => {
    const i = segments.length;
    const dur = session.records[session.records.length - 1]?.t ?? 0;
    const seg: Segment = {
      id: uid(), sessionId: session.id, name: `Lauf ${i + 1}`,
      startT: 0, endT: dur, rpmFactor: vehicle.rpmFactorDefault,
      color: pickColor(i), visible: true, category: defCat,
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
        color: pickColor(segments.length + i), visible: true, category: defCat,
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
        <Field label="Modul / Session-Typ" hint="Bestimmt die Standard-Kategorie neuer Läufe">
          <Select value={kind} onChange={(e) => onEnvUpdate({ kind: e.target.value as any })}>
            {(["performance", "rally", "circuit"] as const).map((k) => (
              <option key={k} value={k}>{SESSION_KIND_LABEL[k]}</option>
            ))}
          </Select>
        </Field>
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
        <summary className="cursor-pointer select-none px-3 py-2 text-caption font-semibold text-muted-foreground">
          Erweitert
        </summary>
        <div className="p-3">
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

      <SessionCurves session={session} segments={segments} vehicle={vehicle} />

      <PeakOverview session={session} segments={segments} vehicle={vehicle} />

      <AccelOverview session={session} segments={segments} />



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
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-body font-semibold text-foreground">Läufe</h4>
          <Button variant="secondary" onClick={addSegment}>+ Lauf</Button>
        </div>
        <ul className="space-y-2">
          {segments.map((g) => (
            <SegmentEditor key={g.id} seg={g} session={session} vehicle={vehicle} maxT={session.records[session.records.length - 1]?.t ?? 0}
              onChange={async (patch) => { await onSaveSeg({ ...g, ...patch }); }}
              onDelete={async () => { if (confirm(`Lauf "${g.name}" löschen?`)) await onDelSeg(g.id); }} />

          ))}
        </ul>
      </div>
    </div>
  );
}

function SegmentEditor({ seg, session, vehicle, maxT, onChange, onDelete }: { seg: Segment; session: Session; vehicle: any; maxT: number; onChange: (patch: Partial<Segment>) => Promise<void>; onDelete: () => void }) {
  const legacyPresets: Array<{ id: string; name: string; rpmFactor: number }> = vehicle?.gearPresets ?? [];

  type GearOpt = { id: string; label: string; rpmFactor: number };

  // Neuer entkoppelter Antrieb: resolveAllGears deckt sowohl neue setups[] als auch
  // migrierte Legacy-gearboxes[] ab.
  const resolved = resolveAllGears(vehicle);
  const bySetup = new Map<string, { name: string; options: GearOpt[] }>();
  for (const r of resolved) {
    if (!bySetup.has(r.setupId)) bySetup.set(r.setupId, { name: r.setupName, options: [] });
    bySetup.get(r.setupId)!.options.push({ id: `${r.setupId}:${r.gear.id}`, label: r.gear.name, rpmFactor: r.rpmFactor });
  }
  const gearboxGroups = Array.from(bySetup.values());

  // Fallback für ganz alte Fahrzeuge, die noch weder gearboxes[] noch gearbox hatten.
  if (gearboxGroups.length === 0 && vehicle?.gearbox) {
    const gb = vehicle.gearbox;
    const options: GearOpt[] = [];
    for (const g of gb.gears ?? []) {
      const f = computeRpmFactor(g.ratio ?? 0, gb.finalDrive ?? 0, gb.tireSpec ?? "");
      if (f && f > 0) options.push({ id: `legacy:${g.id}`, label: g.name, rpmFactor: f });
    }
    if (options.length > 0) gearboxGroups.push({ name: "Getriebe", options });
  }

  const flatGearOptions: GearOpt[] = gearboxGroups.flatMap((g) => g.options);
  const hasAny = flatGearOptions.length + legacyPresets.length > 0;

  return (
    <li className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-caption text-muted-foreground">
          <input type="checkbox" checked={seg.visible} onChange={(e) => onChange({ visible: e.target.checked })} />
          sichtbar
        </label>
        <label className="relative h-6 w-6 flex-none cursor-pointer rounded border border-input" style={{ backgroundColor: seg.color }} title="Farbe ändern">
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
        <Field label="Kategorie" hint="Bestimmt, wie der Lauf ausgewertet wird">
          <Select value={cat} onChange={(e) => onChange({ category: e.target.value as RunCategory })}>
            {catOptions.map((c) => <option key={c} value={c}>{RUN_CATEGORY_LABEL[c]}</option>)}
          </Select>
        </Field>
        <Field label="Start t (s)"><NumInput step="0.1" value={seg.startT} onChange={(e) => onChange({ startT: Math.max(0, +e.target.value) })} /></Field>
        <Field label="Ende t (s)"><NumInput step="0.1" value={seg.endT} onChange={(e) => onChange({ endT: Math.min(maxT, +e.target.value) })} /></Field>

        {hasAny && (
          <Field label="Gemessener Gang" hint="Setzt rpmFactor aus Fahrzeug-Getriebe/Preset">
            <select
              className="w-full rounded-md border border-input bg-muted px-3 py-3 text-body text-foreground focus:border-ring focus:outline-none"
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
                  {grp.options.map((p) => (
                    <option key={p.id} value={p.id}>{p.label} ({p.rpmFactor.toFixed(2)})</option>
                  ))}
                </optgroup>
              ))}
              {legacyPresets.length > 0 && (
                <optgroup label="Presets">
                  {legacyPresets.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.rpmFactor.toFixed(2)})</option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
        )}

        <Field label="rpmFactor (U/min pro km/h)" hint="Manuell überschreibbar"><NumInput step="0.01" value={seg.rpmFactor} onChange={(e) => onChange({ rpmFactor: +e.target.value, gearPresetId: undefined })} /></Field>
        {seg.calibration && (
          <Field label="Segment-Kalibrierung">
            <div className="text-caption text-muted-foreground">Crr {seg.calibration.crr.toFixed(4)} · CdA {seg.calibration.cdA.toFixed(3)}
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

function PeakOverview({ session, segments, vehicle }: { session: Session; segments: Segment[]; vehicle: any }) {
  const [refId, setRefId] = usePersistedState<string>(`dragy.peaks.ref.${session.id}`, "");

  const rows = useMemo(() => {
    return segments.map((g) => {
      const samples = computeSegment(session, g, vehicle);
      let best = { ps: NaN, psRpm: NaN, nm: NaN, nmRpm: NaN };
      for (const s of samples) {
        const ps = s.pEngineW * W_TO_PS;
        if (Number.isFinite(ps) && (!Number.isFinite(best.ps) || ps > best.ps)) { best.ps = ps; best.psRpm = s.rpm; }
        const nm = s.torqueEngineNm;
        if (Number.isFinite(nm) && (!Number.isFinite(best.nm) || nm > best.nm)) { best.nm = nm; best.nmRpm = s.rpm; }
      }
      return { id: g.id, name: g.name, color: g.color, ...best };
    });
  }, [session, segments, vehicle]);

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
    const cls = d.abs > 0.05 ? "text-emerald-400" : d.abs < -0.05 ? "text-red-400" : "text-muted-foreground";
    return (
      <span className={cls}>
        {sign}{d.abs.toFixed(digits)} {unit} ({sign}{d.pct.toFixed(1)} %)
      </span>
    );
  };

  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <div className="text-caption font-semibold text-foreground">Spitzenwerte je Lauf (Motor, geschätzt)</div>
      <Note>Maximale Motorleistung/-drehmoment mit zugehöriger Drehzahl. Referenzlauf wählen, um Abweichungen zu sehen.</Note>
      <div className="mt-2">
        <Field label="Referenzlauf">
          <select
            className="w-full rounded-md border border-input bg-muted px-3 py-3 text-body text-foreground focus:border-ring focus:outline-none"
            value={refId}
            onChange={(e) => setRefId(e.target.value)}
          >
            <option value="">– keine Referenz –</option>
            {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
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
