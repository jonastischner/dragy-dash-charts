import { useMemo, useState } from "react";
import { Field, TextInput, NumInput, Select, Button, Note, Row } from "./ui";
import { Chart, type Series } from "./Chart";
import { NM_PER_PS_RPM } from "@/lib/dragy/physics";
import { CORRECTION_LABEL, type CorrectionStandard } from "@/lib/dragy/correction";
import { formatSessionTime } from "@/lib/dragy/sessionTime";
import type { DynoPoint, DynoRun } from "@/lib/dragy/types";

/**
 * Eingabe und Kontrolle einer gemessenen Prüfstandskurve.
 *
 * Bewusst immer über diesen Dialog, nie direkt speichern: die Zahlen stammen
 * aus einem abfotografierten Protokoll und müssen vom Nutzer gegengelesen
 * werden, bevor sie neben echten Messungen stehen.
 */

/** Eine Zeile der Wertetabelle. Leere Felder bleiben leer, nicht 0. */
interface RowInput { rpm: string; pWheel: string; pDrag: string; pEngine: string }

const emptyRow = (): RowInput => ({ rpm: "", pWheel: "", pDrag: "", pEngine: "" });

const num = (v: string): number | null => {
  const s = v.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const fmt = (n: number | null | undefined, digits = 1): string =>
  n == null || !Number.isFinite(n) ? "" : String(+n.toFixed(digits));

function rowsFromRun(run: DynoRun | null): RowInput[] {
  if (!run || run.points.length === 0) return Array.from({ length: 8 }, emptyRow);
  return run.points.map((p) => ({
    rpm: fmt(p.rpm, 0), pWheel: fmt(p.pWheelPs), pDrag: fmt(p.pDragPs), pEngine: fmt(p.pEnginePs),
  }));
}

/**
 * Eine Zeile zu einem Messpunkt. P-Mot, P-Rad und P-Schlepp hängen über
 * P-Mot = P-Rad + P-Schlepp zusammen; zwei von dreien genügen.
 */
function toPoint(r: RowInput): DynoPoint | null {
  const rpm = num(r.rpm);
  if (rpm == null || rpm <= 0) return null;
  const pWheel = num(r.pWheel), pDrag = num(r.pDrag);
  let pEngine = num(r.pEngine);
  if (pEngine == null && pWheel != null && pDrag != null) pEngine = pWheel + pDrag;
  if (pEngine == null) return null;
  return { rpm, pWheelPs: pWheel, pDragPs: pDrag, pEnginePs: pEngine };
}

export interface DynoDraft {
  name: string;
  rpmFactor: number;
  run: DynoRun;
}

export function DynoImportDialog({ initial, initialName, defaultRpmFactor, onSave, onCancel }: {
  initial?: DynoRun | null;
  initialName?: string;
  defaultRpmFactor: number;
  onSave: (draft: DynoDraft) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName ?? "Prüfstandslauf");
  const [bench, setBench] = useState(initial?.bench ?? "");
  const [operator, setOperator] = useState(initial?.operator ?? "");
  const [standard, setStandard] = useState<CorrectionStandard>(initial?.correctedBy ?? "din70020");
  const [measured, setMeasured] = useState(
    initial?.measuredAt != null ? new Date(initial.measuredAt).toISOString().slice(0, 16) : "",
  );
  const [rpmFactor, setRpmFactor] = useState<number>(defaultRpmFactor);
  const [tempC, setTempC] = useState<number | undefined>(initial?.env?.tempC);
  const [pressureHpa, setPressureHpa] = useState<number | undefined>(initial?.env?.pressureHpa);
  const [rh, setRh] = useState<number | undefined>(initial?.env?.rh);
  const [rows, setRows] = useState<RowInput[]>(() => rowsFromRun(initial ?? null));

  const update = (i: number, patch: Partial<RowInput>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const points = useMemo(
    () => rows.map(toPoint).filter((p): p is DynoPoint => p !== null).sort((a, b) => a.rpm - b.rpm),
    [rows],
  );

  const peaks = useMemo(() => {
    let ps = NaN, psRpm = NaN, nm = NaN, nmRpm = NaN, maxRpm = NaN;
    for (const p of points) {
      if (!Number.isFinite(ps) || p.pEnginePs > ps) { ps = p.pEnginePs; psRpm = p.rpm; }
      const t = NM_PER_PS_RPM * p.pEnginePs / p.rpm;
      if (!Number.isFinite(nm) || t > nm) { nm = t; nmRpm = p.rpm; }
      if (!Number.isFinite(maxRpm) || p.rpm > maxRpm) maxRpm = p.rpm;
    }
    return { ps, psRpm, nm, nmRpm, maxRpm };
  }, [points]);

  const series: Series[] = useMemo(() => {
    const pick = (f: (p: DynoPoint) => number | null, label: string, color: string): Series => ({
      label, color,
      points: points.map((p) => ({ x: p.rpm, y: f(p) ?? NaN })).filter((q) => Number.isFinite(q.y)),
    });
    return [
      pick((p) => p.pEnginePs, "P-Motor (PS)", "#ef4444"),
      pick((p) => p.pWheelPs, "P-Rad (PS)", "#3b82f6"),
      pick((p) => p.pDragPs, "P-Schlepp (PS)", "#22c55e"),
    ].filter((s) => s.points.length > 0);
  }, [points]);

  // Warnungen: lieber sichtbar machen als still speichern.
  const problems: string[] = [];
  if (points.length < 3) problems.push("Mindestens drei Messpunkte nötig.");
  if (new Set(points.map((p) => p.rpm)).size !== points.length) problems.push("Doppelte Drehzahlwerte.");
  const badSplit = points.filter((p) => p.pWheelPs != null && p.pWheelPs > p.pEnginePs).length;
  if (badSplit > 0) problems.push(`${badSplit}× P-Rad größer als P-Motor – Spalten vertauscht?`);
  const inconsistent = points.filter(
    (p) => p.pWheelPs != null && p.pDragPs != null
      && Math.abs(p.pWheelPs + p.pDragPs - p.pEnginePs) > 0.5,
  ).length;
  if (inconsistent > 0) problems.push(`${inconsistent}× P-Rad + P-Schlepp weicht von P-Motor ab.`);
  if (!(rpmFactor > 0)) problems.push("Drehzahlfaktor muss größer als 0 sein.");

  const blocking = points.length < 3 || !(rpmFactor > 0);

  const measuredAt = measured ? new Date(measured).getTime() : NaN;

  const save = () => {
    const env = tempC != null || pressureHpa != null || rh != null ? { tempC, pressureHpa, rh } : undefined;
    const run: DynoRun = {
      points,
      correctedBy: standard,
      source: initial?.source ?? "manual",
      ...(bench.trim() ? { bench: bench.trim() } : {}),
      ...(operator.trim() ? { operator: operator.trim() } : {}),
      ...(Number.isFinite(measuredAt) ? { measuredAt } : {}),
      ...(env ? { env } : {}),
      peaks: {
        psNorm: peaks.ps, psRpm: peaks.psRpm,
        nmNorm: peaks.nm, nmRpm: peaks.nmRpm,
        maxRpm: peaks.maxRpm,
      },
    };
    onSave({ name: name.trim() || "Prüfstandslauf", rpmFactor, run });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-neutral-0/70 p-4 sm:items-center" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-xl bg-card p-4 sm:rounded-xl">
        <h3 className="mb-2 text-base font-semibold text-foreground">Prüfstandsprotokoll</h3>
        <Note>
          Gemessene Leistung über Drehzahl – sie wird nicht aus GPS-Daten gerechnet, sondern
          unverändert übernommen. Zwei der drei Leistungsspalten genügen, die dritte wird ergänzt.
        </Note>

        <Row cols={2}>
          <Field label="Name des Laufs"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Meßdatum" hint="bestimmt Datum und Sortierung der Session">
            <TextInput type="datetime-local" value={measured} onChange={(e) => setMeasured(e.target.value)} />
          </Field>
        </Row>
        <Row cols={2}>
          <Field label="Prüfstand" hint="z.B. MAHA LPS3000 4x4"><TextInput value={bench} onChange={(e) => setBench(e.target.value)} /></Field>
          <Field label="Prüfer"><TextInput value={operator} onChange={(e) => setOperator(e.target.value)} /></Field>
        </Row>
        <Row cols={2}>
          <Field label="Korrektur des Protokolls" hint="wird nicht erneut angewandt">
            <Select value={standard} onChange={(e) => setStandard(e.target.value as CorrectionStandard)}>
              {(Object.keys(CORRECTION_LABEL) as CorrectionStandard[]).map((k) => (
                <option key={k} value={k}>{k === "none" ? "Unkorrigiert (Rohwerte)" : CORRECTION_LABEL[k]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Drehzahlfaktor (U/min pro km/h)" hint="aus den Zahlenpaaren des Protokolls, z.B. 7765 U/min bei 176,6 km/h">
            <NumInput step="0.01" value={rpmFactor} onChange={(e) => setRpmFactor(+e.target.value)} />
          </Field>
        </Row>
        <Row cols={3}>
          <Field label="T Umgebung (°C)" hint="nur Dokumentation"><NumInput allowEmpty value={tempC ?? ""} onChange={(e) => setTempC(e.target.value === "" ? undefined : +e.target.value)} /></Field>
          <Field label="p Luft (hPa)" hint="nur Dokumentation"><NumInput allowEmpty value={pressureHpa ?? ""} onChange={(e) => setPressureHpa(e.target.value === "" ? undefined : +e.target.value)} /></Field>
          <Field label="H Luft (%)" hint="nur Dokumentation"><NumInput allowEmpty value={rh ?? ""} onChange={(e) => setRh(e.target.value === "" ? undefined : +e.target.value)} /></Field>
        </Row>

        <div className="mt-3 text-caption font-semibold text-foreground">Wertetabelle</div>
        <div className="mt-1 grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-1 text-caption text-muted-foreground">
          <div>U/min</div><div>P-Rad</div><div>P-Schlepp</div><div>P-Motor</div><div />
        </div>
        <div className="mt-1 space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-1">
              <NumInput allowEmpty value={r.rpm} onChange={(e) => update(i, { rpm: e.target.value })} />
              <NumInput allowEmpty value={r.pWheel} onChange={(e) => update(i, { pWheel: e.target.value })} />
              <NumInput allowEmpty value={r.pDrag} onChange={(e) => update(i, { pDrag: e.target.value })} />
              <NumInput allowEmpty value={r.pEngine} onChange={(e) => update(i, { pEngine: e.target.value })} />
              <Button variant="danger" onClick={() => setRows(rows.filter((_, k) => k !== i))}>×</Button>
            </div>
          ))}
        </div>
        <Button className="mt-2" variant="secondary" onClick={() => setRows([...rows, emptyRow()])}>+ Zeile</Button>

        {points.length >= 2 && (
          <div className="mt-3">
            <div className="text-caption font-semibold text-foreground">Vorschau</div>
            <Chart series={series} height={220} xLabel="U/min" yLabel="PS"
              xFormat={(v) => v.toFixed(0)} yFormat={(v) => v.toFixed(0)} yFromZero />
            <p className="mt-1 text-caption text-muted-foreground tabular-nums">
              Spitze {peaks.ps.toFixed(1)} PS bei {peaks.psRpm.toFixed(0)} U/min
              {rpmFactor > 0 && ` (${(peaks.psRpm / rpmFactor).toFixed(1)} km/h)`}
              {" · "}{peaks.nm.toFixed(1)} Nm bei {peaks.nmRpm.toFixed(0)} U/min
            </p>
          </div>
        )}

        {problems.length > 0 && (
          <div className="mt-2"><Note>{problems.join(" ")}</Note></div>
        )}
        {Number.isFinite(measuredAt) && (
          <p className="mt-2 text-caption text-muted-foreground">
            Session-Datum: {formatSessionTime(measuredAt)}
          </p>
        )}

        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
          <Button onClick={save} disabled={blocking}>Lauf speichern</Button>
        </div>
      </div>
    </div>
  );
}
