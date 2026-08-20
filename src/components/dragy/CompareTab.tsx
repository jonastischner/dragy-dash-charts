import { useMemo, useState } from "react";
import { Section, Note, EmptyState, Button } from "./ui";
import { PdfExportDialog } from "./PdfExportDialog";
import type { RunPdfData } from "@/lib/dragy/mahaPdf";
import { useAppStore } from "@/lib/dragy/store";
import { computeSegment, W_TO_PS } from "@/lib/dragy/physics";
import { Chart, type Series } from "./Chart";
import type { ModuleId } from "@/lib/dragy/types";
import { isPowerModule, sessionModule } from "@/lib/dragy/modules";
import { sessionCorrection, useCorrectionStandard } from "./useCorrection";
import { CORRECTION_LABEL } from "@/lib/dragy/correction";

type Mode = "pWheel" | "pEngine" | "tqWheel" | "tqEngine" | "accel";
const MODE_LABEL: Record<Mode, string> = {
  pWheel: "Radleistung (PS)",
  pEngine: "Motorleistung geschätzt (PS)",
  tqWheel: "Rad-Drehmoment (Nm)",
  tqEngine: "Motor-Drehmoment geschätzt (Nm)",
  accel: "Beschleunigung (km/h vs. s)",
};

const SPLIT_TARGETS = [60, 100, 150, 200];

export function CompareTab({ module = "power", onOpenVehicles }: { module?: ModuleId; onOpenVehicles?: () => void } = {}) {
  const { state, saveSegment } = useAppStore();
  const [standard] = useCorrectionStandard();
  const activeVehicle = state.vehicles.find((v) => v.id === state.activeVehicleId);
  const allowPower = isPowerModule(module);
  const allowedModes: Mode[] = allowPower ? ["pWheel", "pEngine", "tqWheel", "tqEngine", "accel"] : ["accel"];
  const [mode, setMode] = useState<Mode>(allowPower ? "pWheel" : "accel");
  const [pdfOpen, setPdfOpen] = useState(false);

  const segments = useMemo(() => {
    if (!activeVehicle) return [];
    const own = state.sessions.filter((s) => s.vehicleId === activeVehicle.id && sessionModule(s) === module);
    return state.segments.filter((g) => own.some((s) => s.id === g.sessionId));
  }, [state, activeVehicle, module]);

  if (!activeVehicle) return <Section title="Vergleich"><EmptyState title="Kein aktives Fahrzeug" description="Wähle ein Fahrzeug, um Läufe zu vergleichen." actionLabel="Zur Garage" onAction={onOpenVehicles} /></Section>;

  const isAccel = !allowedModes.includes(mode) || mode === "accel";
  const isEngineMode = mode === "pEngine" || mode === "tqEngine";
  const corrected = standard !== "none";
  // Läufe ohne hinterlegte Umgebungsdaten werden nicht korrigiert – im Chart
  // erscheinen sie sonst unbemerkt neben korrigierten Kurven.
  const uncorrectedRuns = corrected
    ? segments.filter((g) => {
        const s = state.sessions.find((x) => x.id === g.sessionId);
        return !!s && !sessionCorrection(standard, s).applied;
      }).length
    : 0;


  const series: Series[] = segments.map((g) => {
    const session = state.sessions.find((s) => s.id === g.sessionId)!;
    if (isAccel) {
      const points = session.records
        .filter((r) => r.t >= g.startT && r.t <= g.endT)
        .map((r) => ({ x: r.t - g.startT, y: r.speedKmh }));
      return { label: `${session.name} · ${g.name}`, color: g.color, points, visible: g.visible };
    }
    const samples = computeSegment(session, g, activeVehicle);
    // Faktor je Session – nur auf die Motorgrößen, Radwerte bleiben Messwerte.
    const alpha = isEngineMode ? sessionCorrection(standard, session).alpha : 1;
    const points = samples
      .map((s) => {
        let y: number = NaN;
        if (mode === "pWheel") y = s.pWheelW * W_TO_PS;
        else if (mode === "pEngine") y = s.pEngineW * W_TO_PS * alpha;
        else if (mode === "tqWheel") y = s.torqueWheelNm;
        else y = s.torqueEngineNm * alpha;
        return { x: s.rpm, y };
      })
      .filter((p) => Number.isFinite(p.y));
    return { label: `${session.name} · ${g.name}`, color: g.color, points, visible: g.visible };
  });

  const toggle = async (i: number) => {
    const g = segments[i]; if (!g) return;
    await saveSegment({ ...g, visible: !g.visible });
  };



  // Split-Zeiten (nur im Beschleunigungs-Modus): lineare Interpolation an Zielgeschwindigkeit.
  const splitRows = isAccel
    ? segments
        .filter((g) => g.visible !== false)
        .map((g) => {
          const session = state.sessions.find((s) => s.id === g.sessionId)!;
          const rec = session.records.filter((r) => r.t >= g.startT && r.t <= g.endT);
          const t0 = rec[0]?.t ?? g.startT;
          const splits: Record<number, number | null> = {};
          for (const target of SPLIT_TARGETS) {
            let found: number | null = null;
            for (let i = 1; i < rec.length; i++) {
              const a = rec[i - 1], b = rec[i];
              if (a.speedKmh <= target && b.speedKmh >= target && b.speedKmh !== a.speedKmh) {
                const frac = (target - a.speedKmh) / (b.speedKmh - a.speedKmh);
                found = (a.t + frac * (b.t - a.t)) - t0;
                break;
              }
            }
            splits[target] = found;
          }
          return { label: `${session.name} · ${g.name}`, color: g.color, splits };
        })
    : [];

  // Übersicht: alle aktiven (sichtbaren) Läufe mit Peak-Resultaten.
  const overviewRows = (allowPower ? segments : [])
    .filter((g) => g.visible !== false)
    .map((g) => {
      const session = state.sessions.find((s) => s.id === g.sessionId)!;
      const samples = computeSegment(session, g, activeVehicle);
      const rec = session.records.filter((r) => r.t >= g.startT && r.t <= g.endT);
      let pW = 0, pWRpm = NaN, pE = 0, pERpm = NaN, tW = 0, tWRpm = NaN, tE = 0, tERpm = NaN;
      for (const s of samples) {
        const psW = s.pWheelW * W_TO_PS, psE = s.pEngineW * W_TO_PS;
        if (Number.isFinite(psW) && psW > pW) { pW = psW; pWRpm = s.rpm; }
        if (Number.isFinite(psE) && psE > pE) { pE = psE; pERpm = s.rpm; }
        if (Number.isFinite(s.torqueWheelNm) && s.torqueWheelNm > tW) { tW = s.torqueWheelNm; tWRpm = s.rpm; }
        if (Number.isFinite(s.torqueEngineNm) && s.torqueEngineNm > tE) { tE = s.torqueEngineNm; tERpm = s.rpm; }
      }
      const vFrom = rec[0]?.speedKmh ?? NaN;
      const vMax = rec.length ? Math.max(...rec.map((r) => r.speedKmh)) : NaN;
      const dur = rec.length ? rec[rec.length - 1].t - rec[0].t : NaN;
      // applied=false, wenn die Session keine Umgebungsdaten hat – dann bleibt
      // alpha=1 und es wird bewusst nicht korrigiert.
      const corr = sessionCorrection(standard, session);
      return {
        label: `${session.name} · ${g.name}`, color: g.color,
        pW, pWRpm, pE, pERpm, tW, tWRpm, tE, tERpm, vFrom, vMax, dur,
        alpha: corr.alpha, inRange: corr.inRange, applied: corr.applied, missing: corr.missing,
        pECorr: pE * corr.alpha, tECorr: tE * corr.alpha,
      };
    });

  // Sichtbare Läufe als Datenbasis für den Sammel-PDF-Export.
  const pdfRuns: RunPdfData[] = (allowPower ? segments : [])
    .filter((g) => g.visible !== false)
    .map((g) => ({ session: state.sessions.find((s) => s.id === g.sessionId)!, segment: g, vehicle: activeVehicle }))
    .filter((r) => !!r.session);

  const fmt = (v: number, d = 0) => (Number.isFinite(v) && v !== 0 ? v.toFixed(d) : "—");
  const fmtRpm = (v: number) => (Number.isFinite(v) ? `${v.toFixed(0)} U/min` : "—");

  return (
    <div>
      <Section
        title="Vergleich"
        note={
          isAccel
            ? "Beschleunigung: rein GPS-basiert, gangübergreifend – zeigt reale Zeit ab Segmentstart bis zur jeweiligen Geschwindigkeit."
            : "Motorleistung/-drehmoment sind Schätzungen (RPM aus Vmax abgeleitet, Schleppkurve als Näherung). Drehmoment ist gegenüber RPM-Faktor-Fehlern empfindlicher als die Leistung."
        }
      >
        <div className="mb-2 flex flex-wrap gap-2">
          {allowedModes.map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`min-h-11 rounded px-3 text-caption ${mode === m ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>


        {corrected && !isAccel && (
          <Note>
            {isEngineMode ? (
              <>
                <b>Normkorrektur aktiv (experimentell):</b> {CORRECTION_LABEL[standard]}. Jeder Lauf
                wird mit dem Faktor seiner eigenen Umgebungsbedingungen umgerechnet. Gemessene und
                korrigierte Werte stehen in der Übersicht unten nebeneinander.
                {uncorrectedRuns > 0 && (
                  <>
                    {" "}
                    <b>{uncorrectedRuns} Lauf/Läufe</b> haben keine Umgebungsdaten hinterlegt und
                    werden unkorrigiert dargestellt.
                  </>
                )}
              </>
            ) : (
              <>
                Radleistung/-drehmoment sind Messwerte – die aktive Normkorrektur
                ({CORRECTION_LABEL[standard]}) gilt nur für die Motorgrößen.
              </>
            )}
          </Note>
        )}
        {segments.length === 0 ? (
          <p className="text-caption text-muted-foreground">Keine Läufe im aktiven Fahrzeug.</p>
        ) : (
          <>
            <Chart
              series={series}
              xLabel={isAccel ? "t (s)" : "U/min"}
              yLabel={isAccel ? "km/h" : MODE_LABEL[mode]}
              xFormat={(v) => (isAccel ? v.toFixed(2) : v.toFixed(0))}
              yFormat={(v) => v.toFixed(0)}
              onLegendToggle={toggle}
              height={340}
            />
            {isAccel && splitRows.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-caption text-foreground">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2 text-left font-medium">Lauf</th>
                      {SPLIT_TARGETS.map((t) => (
                        <th key={t} className="py-1 pr-2 text-right font-medium">0–{t} km/h</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {splitRows.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-1 pr-2">
                          <span className="mr-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ backgroundColor: r.color }} />
                          {r.label}
                        </td>
                        {SPLIT_TARGETS.map((t) => (
                          <td key={t} className="py-1 pr-2 text-right tabular-nums">
                            {r.splits[t] != null ? `${r.splits[t]!.toFixed(2)} s` : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-caption text-muted-foreground">Split-Zeiten linear zwischen Samples interpoliert; „—" wenn die Zielgeschwindigkeit im Segment nicht erreicht wurde.</p>
              </div>
            )}
          </>
        )}
      </Section>

      {allowPower && (
        <Section title="Übersicht aktive Läufe" note="Peak-Werte je sichtbarem Lauf – Sichtbarkeit über die Chart-Legende steuern.">
          {pdfRuns.length > 0 && (
            <div className="mb-2 flex justify-end">
              <Button variant="secondary" onClick={() => setPdfOpen(true)}>
                PDF-Protokoll ({pdfRuns.length})
              </Button>
            </div>
          )}
          {pdfOpen && <PdfExportDialog runs={pdfRuns} onClose={() => setPdfOpen(false)} />}
          {overviewRows.length === 0 ? (
            <p className="text-caption text-muted-foreground">Keine aktiven Läufe.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-caption text-foreground">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2 text-left font-medium">Lauf</th>
                    <th className="py-1 pr-2 text-right font-medium">Rad PS</th>
                    <th className="py-1 pr-2 text-right font-medium">@ Rad</th>
                    <th className="py-1 pr-2 text-right font-medium">Motor PS</th>
                    {corrected && <th className="py-1 pr-2 text-right font-medium">Motor PS korr.</th>}
                    <th className="py-1 pr-2 text-right font-medium">@ Motor</th>
                    <th className="py-1 pr-2 text-right font-medium">Rad Nm</th>
                    <th className="py-1 pr-2 text-right font-medium">@ Nm</th>
                    <th className="py-1 pr-2 text-right font-medium">Motor Nm</th>
                    {corrected && <th className="py-1 pr-2 text-right font-medium">Motor Nm korr.</th>}
                    <th className="py-1 pr-2 text-right font-medium">@ Nm</th>
                    <th className="py-1 pr-2 text-right font-medium">km/h</th>
                    <th className="py-1 pr-2 text-right font-medium">Dauer</th>
                  </tr>
                </thead>
                <tbody>
                  {overviewRows.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1 pr-2 whitespace-nowrap">
                        <span className="mr-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ backgroundColor: r.color }} />
                        {r.label}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">{fmt(r.pW)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{fmtRpm(r.pWRpm)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{fmt(r.pE)}</td>
                      {corrected && (
                        !r.applied ? (
                          <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground"
                              title={`Nicht korrigiert – ${r.missing.join(", ")} nicht hinterlegt`}>—</td>
                        ) : (
                          <td className={`py-1 pr-2 text-right font-medium tabular-nums ${r.inRange ? "" : "text-warning"}`}
                              title={`α = ${r.alpha.toFixed(3)}${r.inRange ? "" : " – außerhalb des nach EWG 80/1269 zulässigen Bereichs"}`}>
                            {fmt(r.pECorr)}{!r.inRange && " !"}
                          </td>
                        )
                      )}
                      <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{fmtRpm(r.pERpm)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{fmt(r.tW)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{fmtRpm(r.tWRpm)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{fmt(r.tE)}</td>
                      {corrected && (
                        <td className={`py-1 pr-2 text-right tabular-nums ${r.applied ? "font-medium" : "text-muted-foreground"}`}
                            title={r.applied ? undefined : `Nicht korrigiert – ${r.missing.join(", ")} nicht hinterlegt`}>
                          {r.applied ? fmt(r.tECorr) : "—"}
                        </td>
                      )}
                      <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{fmtRpm(r.tERpm)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.vFrom) ? `${r.vFrom.toFixed(0)}–${r.vMax.toFixed(0)}` : "—"}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.dur) ? `${r.dur.toFixed(2)} s` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
    </div>
  );


}
