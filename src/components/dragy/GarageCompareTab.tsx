import { useMemo, useState } from "react";
import { ArrowLeft, Layers, FileText } from "lucide-react";
import { Section, Note, EmptyState, Button, Collapsible, usePersistedState } from "./ui";
import { PdfExportDialog } from "./PdfExportDialog";
import type { RunPdfData } from "@/lib/dragy/mahaPdf";
import { useAppStore, nextUnusedColor } from "@/lib/dragy/store";
import { segmentSamples, W_TO_PS } from "@/lib/dragy/physics";
import { Chart, type Series } from "./Chart";
import type { Segment, Session, Vehicle } from "@/lib/dragy/types";
import { sessionModule } from "@/lib/dragy/modules";
import { segmentAlpha, sessionCorrection, useCorrectionStandard } from "./useCorrection";
import { sortedByName } from "@/lib/dragy/sort";
import { compareSessionsDesc } from "@/lib/dragy/sessionTime";
import { CORRECTION_LABEL } from "@/lib/dragy/correction";

/**
 * Garagenübergreifender Leistungs-/Drehmomentvergleich: Läufe aus
 * beliebigen Fahrzeugen nebeneinanderlegen, statt nur innerhalb des aktiven
 * Fahrzeugs wie in CompareTab.tsx.
 *
 * Bewusst eine eigene Komponente statt eine Erweiterung von CompareTab: dort
 * hängen die Leistungs-/Drehmoment-Modi eng mit einem "Beschleunigung"-Modus
 * zusammen (gemeinsame Knopfreihe, gemeinsames Chart) – ein garagenweiter
 * Vergleich hat aber keine sinnvolle "Beschleunigung"-Ansicht (Fahrzeuge
 * haben unterschiedliches Gewicht/Widerstand, ein direkter Speed-über-Zeit-
 * Vergleich wäre irreführend). Die Berechnungen selbst (segmentSamples,
 * Korrektur, PDF-Export) sind identisch zu CompareTab und werden 1:1
 * wiederverwendet.
 */

type Mode = "pWheel" | "pEngine" | "tqWheel" | "tqEngine";
const MODE_LABEL: Record<Mode, string> = {
  pWheel: "Radleistung (PS)",
  pEngine: "Motorleistung geschätzt (PS)",
  tqWheel: "Rad-Drehmoment (Nm)",
  tqEngine: "Motor-Drehmoment geschätzt (Nm)",
};
const MODES: Mode[] = ["pWheel", "pEngine", "tqWheel", "tqEngine"];

interface PickRow { vehicle: Vehicle; session: Session; segment: Segment }

export function GarageCompareTab({ onBack, onOpenGarage }: { onBack: () => void; onOpenGarage?: () => void }) {
  const { state } = useAppStore();
  const [standard] = useCorrectionStandard();
  const [mode, setMode] = useState<Mode>("pWheel");
  const [pdfOpen, setPdfOpen] = useState(false);
  const [selected, setSelected] = usePersistedState<string[]>("dragy.garageCompare.selected", []);

  // Je Fahrzeug dessen Leistungs-Läufe – nur Fahrzeuge mit mindestens einem
  // solchen Lauf werden im Picker angezeigt, sonst nur Rauschen.
  const byVehicle = useMemo(() => {
    return state.vehicles
      .map((vehicle) => {
        const sessions = state.sessions
          .filter((s) => s.vehicleId === vehicle.id && sessionModule(s) === "power")
          .sort(compareSessionsDesc);
        const rows: PickRow[] = sessions.flatMap((session) =>
          sortedByName(state.segments.filter((g) => g.sessionId === session.id))
            .map((segment) => ({ vehicle, session, segment })),
        );
        return { vehicle, rows };
      })
      .filter((v) => v.rows.length > 0);
  }, [state]);

  const allRows = useMemo(() => byVehicle.flatMap((v) => v.rows), [byVehicle]);
  const rowById = useMemo(() => new Map(allRows.map((r) => [r.segment.id, r])), [allRows]);
  const selectedSet = new Set(selected);

  const toggleSelect = (segmentId: string) =>
    setSelected((sel) => (sel.includes(segmentId) ? sel.filter((id) => id !== segmentId) : [...sel, segmentId]));

  // Läufe in Auswahlreihenfolge auflösen; nicht mehr existierende IDs (z.B.
  // ein inzwischen gelöschter Lauf) werden einfach übergangen.
  const rawRuns = selected.map((id) => rowById.get(id)).filter((r): r is PickRow => !!r);

  // Segmentfarben sind nur innerhalb eines Fahrzeugs eindeutig. Über mehrere
  // Garagen hinweg sind Kollisionen real – hier nur für die Anzeige auflösen,
  // die gespeicherten Segmente bleiben unangetastet.
  const usedColors: string[] = [];
  const runs = rawRuns.map((r) => {
    const color = usedColors.includes(r.segment.color) ? nextUnusedColor(usedColors) : r.segment.color;
    usedColors.push(color);
    return { ...r, segment: { ...r.segment, color } };
  });

  const isEngineMode = mode === "pEngine" || mode === "tqEngine";
  const corrected = standard !== "none";
  const uncorrectedRuns = corrected
    ? runs.filter((r) => !sessionCorrection(standard, r.session).applied).length
    : 0;

  const series: Series[] = runs.map((r) => {
    const samples = segmentSamples(r.session, r.segment, r.vehicle);
    const alpha = isEngineMode ? segmentAlpha(r.segment, sessionCorrection(standard, r.session)) : 1;
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
    return { label: `${r.vehicle.name} · ${r.session.name} · ${r.segment.name}`, color: r.segment.color, points };
  });

  const overviewRows = runs.map((r) => {
    const samples = segmentSamples(r.session, r.segment, r.vehicle);
    const rec = r.session.records.filter((rec) => rec.t >= r.segment.startT && rec.t <= r.segment.endT);
    let pW = 0, pWRpm = NaN, pE = 0, pERpm = NaN, tW = 0, tWRpm = NaN, tE = 0, tERpm = NaN;
    for (const s of samples) {
      const psW = s.pWheelW * W_TO_PS, psE = s.pEngineW * W_TO_PS;
      if (Number.isFinite(psW) && psW > pW) { pW = psW; pWRpm = s.rpm; }
      if (Number.isFinite(psE) && psE > pE) { pE = psE; pERpm = s.rpm; }
      if (Number.isFinite(s.torqueWheelNm) && s.torqueWheelNm > tW) { tW = s.torqueWheelNm; tWRpm = s.rpm; }
      if (Number.isFinite(s.torqueEngineNm) && s.torqueEngineNm > tE) { tE = s.torqueEngineNm; tERpm = s.rpm; }
    }
    const vFrom = rec[0]?.speedKmh ?? NaN;
    const vMax = rec.length ? Math.max(...rec.map((rr) => rr.speedKmh)) : NaN;
    const dur = rec.length ? rec[rec.length - 1].t - rec[0].t : NaN;
    const corr = sessionCorrection(standard, r.session);
    return {
      label: `${r.vehicle.name} · ${r.session.name} · ${r.segment.name}`, color: r.segment.color,
      pW, pWRpm, pE, pERpm, tW, tWRpm, tE, tERpm, vFrom, vMax, dur,
      alpha: corr.alpha, inRange: corr.inRange, applied: corr.applied, missing: corr.missing,
      pECorr: pE * corr.alpha, tECorr: tE * corr.alpha,
    };
  });

  const pdfRuns: RunPdfData[] = runs.map((r) => ({ session: r.session, segment: r.segment, vehicle: r.vehicle }));

  const fmt = (v: number, d = 0) => (Number.isFinite(v) && v !== 0 ? v.toFixed(d) : "—");
  const fmtRpm = (v: number) => (Number.isFinite(v) ? `${v.toFixed(0)} U/min` : "—");

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
          <h2 className="text-body font-semibold text-foreground">Fahrzeugvergleich</h2>
          <p className="text-caption text-muted-foreground">Leistungs- und Drehmomentläufe aus deiner ganzen Garage vergleichen – unabhängig vom aktiven Fahrzeug.</p>
        </div>
      </div>

      <Section title="Läufe auswählen" note="Beliebige Läufe aus beliebigen Fahrzeugen – nur das Modul Leistung & Drehmoment.">
        {byVehicle.length === 0 ? (
          <EmptyState
            icon={<Layers />}
            title="Noch keine passenden Läufe"
            description="Lege zuerst ein Fahrzeug mit Läufen im Modul „Leistung & Drehmoment“ an."
            actionLabel="Zur Garage"
            onAction={onOpenGarage}
          />
        ) : (
          <div className="space-y-2">
            {byVehicle.map(({ vehicle, rows }) => {
              const n = rows.filter((r) => selectedSet.has(r.segment.id)).length;
              return (
                <Collapsible
                  key={vehicle.id}
                  title={vehicle.name}
                  subtitle={n > 0 ? `${n} von ${rows.length} Läufen ausgewählt` : `${rows.length} Läufe`}
                  persistKey={`dragy.garageCompare.vehicle.${vehicle.id}`}
                  level="sub"
                >
                  <ul className="space-y-1">
                    {rows.map(({ session, segment }) => (
                      <li key={segment.id}>
                        <label className="flex min-h-11 items-center gap-2 rounded-md px-1 text-caption text-foreground hover:bg-accent">
                          <input
                            type="checkbox"
                            checked={selectedSet.has(segment.id)}
                            onChange={() => toggleSelect(segment.id)}
                            className="h-4 w-4 flex-none"
                          />
                          <span className="h-2 w-3 flex-none rounded-sm" style={{ backgroundColor: segment.color }} />
                          <span className="min-w-0 flex-1 truncate">{session.name} · {segment.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </Collapsible>
              );
            })}
          </div>
        )}
      </Section>

      {runs.length > 0 && (
        <>
          <Section
            title="Vergleich"
            note="Motorleistung/-drehmoment sind Schätzungen (RPM aus Vmax abgeleitet, Schleppkurve als Näherung). Drehmoment ist gegenüber RPM-Faktor-Fehlern empfindlicher als die Leistung."
          >
            <div className="mb-2 flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`min-h-11 rounded px-3 text-caption ${mode === m ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
            {corrected && (
              <Note>
                {isEngineMode ? (
                  <>
                    <b>Normkorrektur aktiv (experimentell):</b> {CORRECTION_LABEL[standard]}. Jeder Lauf
                    wird mit dem Faktor seiner eigenen Umgebungsbedingungen umgerechnet.
                    {uncorrectedRuns > 0 && (
                      <>
                        {" "}
                        <b>{uncorrectedRuns} Lauf/Läufe</b> haben keine Umgebungsdaten hinterlegt (oder sind
                        bereits ab Werk korrigiert) und werden unkorrigiert dargestellt.
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
            <Chart
              series={series}
              xLabel="U/min"
              yLabel={MODE_LABEL[mode]}
              yFromZero
              xFormat={(v) => v.toFixed(0)}
              yFormat={(v) => v.toFixed(0)}
              onLegendToggle={(i) => { const r = runs[i]; if (r) toggleSelect(r.segment.id); }}
              height={340}
            />
          </Section>

          <Section title="Übersicht ausgewählte Läufe" note="Peak-Werte je ausgewähltem Lauf – Auswahl über die Checkboxen oben oder die Chart-Legende steuern.">
            <div className="mb-2 flex justify-end">
              <Button variant="secondary" onClick={() => setPdfOpen(true)}>
                <FileText className="h-4 w-4" aria-hidden="true" />
                PDF-Protokoll ({pdfRuns.length})
              </Button>
            </div>
            {pdfOpen && <PdfExportDialog runs={pdfRuns} onClose={() => setPdfOpen(false)} />}
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
          </Section>
        </>
      )}
    </div>
  );
}
