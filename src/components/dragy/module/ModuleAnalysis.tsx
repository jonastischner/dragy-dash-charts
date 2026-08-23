import { useMemo } from "react";
import { Section, Field, Select, Note, Row, usePersistedState } from "../ui";
import { segmentSamples, splitTime, distanceRun, runDistance, W_TO_PS, ACCEL_SPLITS } from "@/lib/dragy/physics";
import type { ModuleId, Segment, Session, Vehicle } from "@/lib/dragy/types";
import { isPowerModule } from "@/lib/dragy/modules";
import { sessionCorrection, useCorrectionStandard } from "../useCorrection";
import { CORRECTION_LABEL } from "@/lib/dragy/correction";
import { CorrectionSelect } from "../CorrectionSelect";

type Ctx = { sessions: Session[]; segments: Segment[]; vehicle: Vehicle };

export function ModuleAnalysis({ module, sessions, segments, vehicle }: Ctx & { module: ModuleId }) {
  if (isPowerModule(module)) return <PowerAnalysis sessions={sessions} segments={segments} vehicle={vehicle} />;
  if (module === "accel") return <AccelAnalysis sessions={sessions} segments={segments} vehicle={vehicle} />;
  return <TrackAnalysis sessions={sessions} segments={segments} vehicle={vehicle} module={module} />;
}

function segsOf(sessions: Session[], segments: Segment[]) {
  return sessions.flatMap((s) => segments.filter((g) => g.sessionId === s.id).map((g) => ({ session: s, seg: g })));
}

/* ---------------- Leistung ---------------- */

function PowerAnalysis({ sessions, segments, vehicle }: Ctx) {
  const [refKey, setRefKey] = usePersistedState<string>(`dragy.power.ref.${vehicle.id}`, "");
  const [standard] = useCorrectionStandard();
  const corrected = standard !== "none";

  const rows = useMemo(() => segsOf(sessions, segments).map(({ session, seg }) => {
    const samples = segmentSamples(session, seg, vehicle);
    let ps = NaN, psRpm = NaN, nm = NaN, nmRpm = NaN;
    for (const s of samples) {
      const p = s.pEngineW * W_TO_PS;
      if (Number.isFinite(p) && (!Number.isFinite(ps) || p > ps)) { ps = p; psRpm = s.rpm; }
      const t = s.torqueEngineNm;
      if (Number.isFinite(t) && (!Number.isFinite(nm) || t > nm)) { nm = t; nmRpm = s.rpm; }
    }
    // Faktor je Session: Läufe bei unterschiedlichem Wetter bekommen
    // unterschiedliche alpha – genau das macht sie erst vergleichbar.
    // Ohne hinterlegte Umgebungsdaten bleibt applied=false und alpha=1: der Lauf
    // wird bewusst nicht korrigiert, statt einen Faktor zu erfinden.
    const corr = sessionCorrection(standard, session);
    return {
      key: `${session.id}:${seg.id}`, session, seg, ps, psRpm, nm, nmRpm,
      alpha: corr.alpha, inRange: corr.inRange, applied: corr.applied, missing: corr.missing,
      psCorr: ps * corr.alpha, nmCorr: nm * corr.alpha,
    };
  }).filter((r) => Number.isFinite(r.ps))
    .sort((a, b) => (corrected ? b.psCorr - a.psCorr : b.ps - a.ps)),
  [sessions, segments, vehicle, standard, corrected]);

  if (rows.length === 0) {
    return <Section title="Auswertung"><p className="text-caption text-muted-foreground">Noch keine Läufe zum Auswerten.</p></Section>;
  }

  const ref = rows.find((r) => r.key === refKey);
  const uncorrected = rows.filter((r) => !r.applied).length;
  const fmtDelta = (val: number, base: number, unit: string) => {
    if (!Number.isFinite(val) || !Number.isFinite(base) || base === 0) return "—";
    const abs = val - base, pct = (abs / base) * 100, sign = abs > 0 ? "+" : "";
    const cls = abs > 0.05 ? "text-emerald-400" : abs < -0.05 ? "text-destructive" : "text-muted-foreground";
    return <span className={cls}>{sign}{abs.toFixed(0)} {unit} ({sign}{pct.toFixed(1)} %)</span>;
  };

  return (
    <Section title="Bestenliste Leistung" note={`${rows.length} Läufe · ${vehicle.name}`}>
      <Note>Alle Läufe dieses Moduls nach geschätzter Motorleistung sortiert. Ein Lauf kann als Referenz gesetzt werden.</Note>
      {corrected && (
        <Note>
          <b>Normkorrektur aktiv (experimentell):</b> {CORRECTION_LABEL[standard]}. Sortiert nach
          korrigierter Leistung; jeder Lauf wird mit dem Faktor seiner eigenen Umgebungsbedingungen
          umgerechnet. α-Werte außerhalb des zulässigen Bereichs sind markiert.
          {uncorrected > 0 && (
            <>
              {" "}
              <b>{uncorrected} von {rows.length} Läufen</b> haben keine Umgebungsdaten hinterlegt und
              bleiben unkorrigiert – sie stehen mit ihrem Messwert in der Liste.
            </>
          )}
        </Note>
      )}
      <Row className="mt-2">
        <Field label="Referenzlauf">
          <Select value={refKey} onChange={(e) => setRefKey(e.target.value)}>
            <option value="">– keine Referenz –</option>
            {rows.map((r) => <option key={r.key} value={r.key}>{r.session.name} – {r.seg.name}</option>)}
          </Select>
        </Field>
        <CorrectionSelect />
      </Row>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-caption text-foreground">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 text-left font-medium">Session</th>
              <th className="py-1 pr-2 text-left font-medium">Lauf</th>
              <th className="py-1 pr-2 text-right font-medium">{corrected ? "PS gemessen" : "Peak PS"}</th>
              {corrected && <th className="py-1 pr-2 text-right font-medium">α</th>}
              {corrected && <th className="py-1 pr-2 text-right font-medium">PS korrigiert</th>}
              <th className="py-1 pr-2 text-right font-medium">@ U/min</th>
              {ref && <th className="py-1 pr-2 text-right font-medium">Δ PS</th>}
              <th className="py-1 pr-2 text-right font-medium">{corrected ? "Nm gemessen" : "Peak Nm"}</th>
              {corrected && <th className="py-1 pr-2 text-right font-medium">Nm korrigiert</th>}
              <th className="py-1 pr-2 text-right font-medium">@ U/min</th>
              {ref && <th className="py-1 pr-2 text-right font-medium">Δ Nm</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className={`border-t border-border ${r.key === refKey ? "bg-secondary/40" : ""}`}>
                <td className="py-1 pr-2">{r.session.name}{i === 0 && <span className="ml-1 text-emerald-400">★</span>}</td>
                <td className="py-1 pr-2">
                  <span className="mr-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ backgroundColor: r.seg.color }} />
                  {r.seg.name}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.ps.toFixed(0)}</td>
                {corrected && (
                  !r.applied ? (
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground"
                        title={`Nicht korrigiert – ${r.missing.join(", ")} nicht hinterlegt`}>—</td>
                  ) : (
                    <td className={`py-1 pr-2 text-right tabular-nums ${r.inRange ? "text-muted-foreground" : "text-warning"}`}
                        title={r.inRange ? undefined : "Außerhalb des nach EWG 80/1269 zulässigen Bereichs"}>
                      {r.alpha.toFixed(3).replace(".", ",")}{!r.inRange && " !"}
                    </td>
                  )
                )}
                {corrected && (
                  <td className={`py-1 pr-2 text-right tabular-nums ${r.applied ? "font-medium" : "text-muted-foreground"}`}
                      title={r.applied ? undefined : `Nicht korrigiert – ${r.missing.join(", ")} nicht hinterlegt`}>
                    {r.applied ? r.psCorr.toFixed(0) : "—"}
                  </td>
                )}
                <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.psRpm) ? r.psRpm.toFixed(0) : "—"}</td>
                {ref && (
                  <td className="py-1 pr-2 text-right tabular-nums"
                      title={corrected && r.applied !== ref.applied ? "Vergleich mischt korrigierten und unkorrigierten Wert" : undefined}>
                    {r.key === refKey ? "—" : fmtDelta(corrected ? r.psCorr : r.ps, corrected ? ref.psCorr : ref.ps, "PS")}
                    {corrected && r.key !== refKey && r.applied !== ref.applied && <span className="ml-1 text-warning">!</span>}
                  </td>
                )}
                <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.nm) ? r.nm.toFixed(0) : "—"}</td>
                {corrected && (
                  <td className={`py-1 pr-2 text-right tabular-nums ${r.applied ? "font-medium" : "text-muted-foreground"}`}
                      title={r.applied ? undefined : `Nicht korrigiert – ${r.missing.join(", ")} nicht hinterlegt`}>
                    {r.applied && Number.isFinite(r.nmCorr) ? r.nmCorr.toFixed(0) : "—"}
                  </td>
                )}
                <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.nmRpm) ? r.nmRpm.toFixed(0) : "—"}</td>
                {ref && (
                  <td className="py-1 pr-2 text-right tabular-nums"
                      title={corrected && r.applied !== ref.applied ? "Vergleich mischt korrigierten und unkorrigierten Wert" : undefined}>
                    {r.key === refKey ? "—" : fmtDelta(corrected ? r.nmCorr : r.nm, corrected ? ref.nmCorr : ref.nm, "Nm")}
                    {corrected && r.key !== refKey && r.applied !== ref.applied && <span className="ml-1 text-warning">!</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ---------------- Beschleunigung ---------------- */

function AccelAnalysis({ sessions, segments, vehicle }: Ctx) {
  const rows = useMemo(() => segsOf(sessions, segments).map(({ session, seg }) => ({
    key: `${session.id}:${seg.id}`, session, seg,
    splits: ACCEL_SPLITS.map(([a, b]) => splitTime(session.records, seg.startT, seg.endT, a, b)),
    quarter: distanceRun(session.records, seg.startT, seg.endT),
  })), [sessions, segments]);

  if (rows.length === 0) {
    return <Section title="Auswertung"><p className="text-caption text-muted-foreground">Noch keine Läufe zum Auswerten.</p></Section>;
  }

  const bestPerSplit = ACCEL_SPLITS.map((_, i) => {
    const vals = rows.map((r) => r.splits[i]).filter((v): v is number => v != null);
    return vals.length ? Math.min(...vals) : null;
  });

  return (
    <Section title="Bestenliste Beschleunigung" note={`${rows.length} Läufe · ${vehicle.name}`}>
      <Note>Split-Zeiten aller Läufe dieses Moduls; Bestwert je Spalte hervorgehoben.</Note>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-caption text-foreground">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 text-left font-medium">Session</th>
              <th className="py-1 pr-2 text-left font-medium">Lauf</th>
              {ACCEL_SPLITS.map(([a, b]) => <th key={`${a}-${b}`} className="py-1 pr-2 text-right font-medium">{a}–{b}</th>)}
              <th className="py-1 pr-2 text-right font-medium">1/4 Meile</th>
              <th className="py-1 pr-2 text-right font-medium">Trap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="py-1 pr-2">{r.session.name}</td>
                <td className="py-1 pr-2">
                  <span className="mr-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ backgroundColor: r.seg.color }} />
                  {r.seg.name}
                </td>
                {r.splits.map((s, i) => (
                  <td key={i} className={`py-1 pr-2 text-right tabular-nums ${s != null && bestPerSplit[i] === s ? "text-emerald-400" : ""}`}>
                    {s != null ? `${s.toFixed(2)} s` : "—"}
                  </td>
                ))}
                <td className="py-1 pr-2 text-right tabular-nums">{r.quarter ? `${r.quarter.seconds.toFixed(2)} s` : "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.quarter ? `${r.quarter.trapKmh.toFixed(0)} km/h` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ---------------- Rallye / Rundstrecke ---------------- */

function TrackAnalysis({ sessions, segments, vehicle, module }: Ctx & { module: ModuleId }) {
  const rows = useMemo(() => segsOf(sessions, segments).map(({ session, seg }) => {
    const rec = session.records.filter((r) => r.t >= seg.startT && r.t <= seg.endT);
    const dur = rec.length ? rec[rec.length - 1].t - rec[0].t : NaN;
    const dist = runDistance(session.records, seg.startT, seg.endT);
    const vMax = rec.length ? Math.max(...rec.map((r) => r.speedKmh)) : NaN;
    return { key: `${session.id}:${seg.id}`, session, seg, dur, dist, vMax, vAvg: dur > 0 ? (dist / dur) * 3.6 : NaN };
  }).filter((r) => Number.isFinite(r.dur)).sort((a, b) => a.dur - b.dur), [sessions, segments]);

  if (rows.length === 0) {
    return <Section title="Auswertung"><p className="text-caption text-muted-foreground">Noch keine {module === "rally" ? "Stages" : "Runden"} zum Auswerten.</p></Section>;
  }
  const best = rows[0];

  return (
    <Section title={module === "rally" ? "Bestenliste Stages" : "Bestenliste Runden"} note={`${rows.length} Läufe · ${vehicle.name}`}>
      <Note>Sortiert nach Zeit. Distanz aus der GPS-Geschwindigkeit integriert – ohne Streckenreferenz nur innerhalb derselben Strecke vergleichbar.</Note>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-caption text-foreground">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 text-left font-medium">Session</th>
              <th className="py-1 pr-2 text-left font-medium">{module === "rally" ? "Stage" : "Runde"}</th>
              <th className="py-1 pr-2 text-right font-medium">Zeit</th>
              <th className="py-1 pr-2 text-right font-medium">Δ Best</th>
              <th className="py-1 pr-2 text-right font-medium">Distanz</th>
              <th className="py-1 pr-2 text-right font-medium">Ø km/h</th>
              <th className="py-1 pr-2 text-right font-medium">Max km/h</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="py-1 pr-2">{r.session.name}</td>
                <td className="py-1 pr-2">
                  <span className="mr-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ backgroundColor: r.seg.color }} />
                  {r.seg.name}{r.key === best.key && <span className="ml-1 text-emerald-400">★</span>}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.dur.toFixed(2)} s</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.key === best.key ? "—" : `+${(r.dur - best.dur).toFixed(2)} s`}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.dist.toFixed(0)} m</td>
                <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.vAvg) ? r.vAvg.toFixed(0) : "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.vMax) ? r.vMax.toFixed(0) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
