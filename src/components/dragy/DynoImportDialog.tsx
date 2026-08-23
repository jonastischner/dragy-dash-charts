import { useMemo, useRef, useState } from "react";
import { Field, TextInput, NumInput, Select, Button, Note, Row } from "./ui";
import { Chart, type Series } from "./Chart";
import { NM_PER_PS_RPM } from "@/lib/dragy/physics";
import { CORRECTION_LABEL, type CorrectionStandard } from "@/lib/dragy/correction";
import { formatSessionTime } from "@/lib/dragy/sessionTime";
import type { DynoPoint, DynoRun } from "@/lib/dragy/types";
import { extractDynoSheet, sheetToRun, ANCHOR_WARN, type AnchorInfo } from "@/lib/dragy/dynoExtract";
import { DYNO_CSV_TEMPLATE, DYNO_CSV_PROMPT, parseDynoCsv } from "@/lib/dragy/dynoCsv";
import { Collapsible } from "./ui";
import { errorMessage } from "@/lib/dragy/errors";

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

/**
 * Epoch-ms als Wert für <input type="datetime-local">. Bewusst über die
 * lokalen Getter statt toISOString(): letzteres rechnet nach UTC um und
 * verschöbe das Meßdatum um den Zeitzonen-Versatz.
 */
function localInputValue(ms: number): string {
  const d = new Date(ms);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

const num = (v: string): number | null => {
  const s = v.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Eckwert auf eine Nachkommastelle, NaN wird weggelassen statt gespeichert. */
const num1 = (v: number, key: string): Record<string, number> =>
  Number.isFinite(v) ? { [key]: +v.toFixed(1) } : {};

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
    initial?.measuredAt != null ? localInputValue(initial.measuredAt) : "",
  );
  const [rpmFactor, setRpmFactor] = useState<number>(defaultRpmFactor);
  const [tempC, setTempC] = useState<number | undefined>(initial?.env?.tempC);
  const [pressureHpa, setPressureHpa] = useState<number | undefined>(initial?.env?.pressureHpa);
  const [rh, setRh] = useState<number | undefined>(initial?.env?.rh);
  const [rows, setRows] = useState<RowInput[]>(() => rowsFromRun(initial ?? null));
  const [anchor, setAnchor] = useState<AnchorInfo | null>(null);
  // Herkunft mitführen: aus dem Protokoll ausgelesene Werte sind etwas
  // anderes als von Hand eingetippte, auch wenn beide danach editierbar sind.
  const [source, setSource] = useState<DynoRun["source"]>(initial?.source ?? "manual");
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  /** Ergebnis einer Quelle in die Felder übernehmen – gemeinsam für Foto und CSV. */
  const applySheet = (
    run: ReturnType<typeof sheetToRun>["run"],
    f: number | null,
    a: AnchorInfo,
    src: DynoRun["source"],
    fallbackName?: string,
  ) => {
    setRows(rowsFromRun(run));
    setAnchor(a);
    setSource(src);
    setStandard(run.correctedBy);
    if (fallbackName) setName(fallbackName);
    if (run.bench) setBench(run.bench);
    if (run.operator) setOperator(run.operator);
    if (run.measuredAt != null) setMeasured(localInputValue(run.measuredAt));
    if (run.env?.tempC != null) setTempC(run.env.tempC);
    if (run.env?.pressureHpa != null) setPressureHpa(run.env.pressureHpa);
    if (run.env?.rh != null) setRh(run.env.rh);
    if (f != null && f > 0) setRpmFactor(+f.toFixed(2));
  };

  /** Vorlage als Datei anbieten – Muster wie beim Backup-Export. */
  const downloadTemplate = () => {
    const blob = new Blob([DYNO_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pruefstand-vorlage.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Ausgefüllte Vorlage einlesen – füllt denselben Dialog vor, speichert nichts. */
  const readCsv = async (file: File | undefined) => {
    if (!file) return;
    setReadError(null);
    try {
      const { sheet, name: csvName, rpmFactor: explicit } = parseDynoCsv(await file.text());
      const { run, rpmFactor: derived, anchor: a } = sheetToRun(sheet);
      if (run.points.length === 0) throw new Error("Die Wertetabelle enthält keine verwertbaren Zeilen.");
      applySheet(run, explicit ?? derived, a, "manual", csvName);
    } catch (e) {
      setReadError(errorMessage(e, "Die CSV konnte nicht gelesen werden."));
    } finally {
      if (csvRef.current) csvRef.current.value = "";
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(DYNO_CSV_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setReadError("Kopieren wurde vom Browser verwehrt – bitte den Text von Hand markieren.");
    }
  };

  /** Foto/PDF auslesen lassen und die Felder vorbefüllen – nichts speichern. */
  const readSheet = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setReadError(null);
    try {
      const sheet = await extractDynoSheet(file);
      const { run, rpmFactor: f, anchor: a } = sheetToRun(sheet);
      if (run.points.length === 0) throw new Error("Im Protokoll wurden keine Kurvenpunkte gefunden.");
      applySheet(run, f, a, "vision");
    } catch (e) {
      setReadError(errorMessage(e, "Das Protokoll konnte nicht ausgelesen werden."));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const update = (i: number, patch: Partial<RowInput>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const points = useMemo(
    () => rows.map(toPoint).filter((p): p is DynoPoint => p !== null).sort((a, b) => a.rpm - b.rpm),
    [rows],
  );

  // Eckwerte aus der bestätigten Tabelle – nicht aus der Extraktion. Was der
  // Nutzer im Dialog sieht, ist auch das, was gespeichert wird.
  const peaks = useMemo(() => {
    let ps = NaN, psRpm = NaN, nm = NaN, nmRpm = NaN, maxRpm = NaN, psWheel = NaN, psDrag = NaN;
    for (const p of points) {
      if (!Number.isFinite(ps) || p.pEnginePs > ps) { ps = p.pEnginePs; psRpm = p.rpm; }
      const t = NM_PER_PS_RPM * p.pEnginePs / p.rpm;
      if (!Number.isFinite(nm) || t > nm) { nm = t; nmRpm = p.rpm; }
      if (!Number.isFinite(maxRpm) || p.rpm > maxRpm) maxRpm = p.rpm;
      if (p.pWheelPs != null && (!Number.isFinite(psWheel) || p.pWheelPs > psWheel)) psWheel = p.pWheelPs;
      if (p.pDragPs != null && (!Number.isFinite(psDrag) || p.pDragPs > psDrag)) psDrag = p.pDragPs;
    }
    return { ps, psRpm, nm, nmRpm, maxRpm, psWheel, psDrag };
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
      source,
      ...(bench.trim() ? { bench: bench.trim() } : {}),
      ...(operator.trim() ? { operator: operator.trim() } : {}),
      ...(Number.isFinite(measuredAt) ? { measuredAt } : {}),
      ...(env ? { env } : {}),
      peaks: {
        ...num1(peaks.ps, "psNorm"), ...num1(peaks.psRpm, "psRpm"),
        ...num1(peaks.nm, "nmNorm"), ...num1(peaks.nmRpm, "nmRpm"),
        ...num1(peaks.psWheel, "psWheel"), ...num1(peaks.psDrag, "psDrag"),
        ...num1(peaks.maxRpm, "maxRpm"),
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

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input ref={csvRef} type="file" accept=".csv,text/csv,text/plain" className="hidden"
            onChange={(e) => readCsv(e.target.files?.[0])} />
          <Button variant="secondary" onClick={downloadTemplate}>CSV-Vorlage herunterladen</Button>
          <Button variant="secondary" onClick={() => csvRef.current?.click()}>Ausgefüllte CSV laden…</Button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={(e) => readSheet(e.target.files?.[0])} />
          <Button variant="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Wird ausgelesen…" : "Foto direkt auslesen…"}
          </Button>
        </div>
        <p className="mt-1 text-caption text-muted-foreground">
          Alles optional – es füllt nur die Felder vor, geprüft und gespeichert wird hier.
        </p>

        <div className="mt-2">
          <Collapsible title="Vorlage ausfüllen lassen (KI-Prompt)" persistKey="dragy.dyno.promptHelp">
            <ol className="ml-4 list-decimal space-y-1 text-caption text-muted-foreground">
              <li>Oben <b>CSV-Vorlage herunterladen</b>.</li>
              <li>In Claude (oder einem anderen Modell) ein <b>Foto des Protokolls</b> und die
                  <b> Vorlage</b> anhängen und den Prompt unten einfügen.</li>
              <li>Die zurückgegebene CSV speichern und hier mit <b>Ausgefüllte CSV laden…</b> öffnen.</li>
              <li>Werte gegen das Protokoll prüfen, dann speichern.</li>
            </ol>
            <div className="mt-2 flex items-center gap-2">
              <Button variant="secondary" onClick={copyPrompt}>
                {copied ? "Kopiert ✓" : "Prompt kopieren"}
              </Button>
            </div>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-elevated p-2 text-caption text-muted-foreground">
              {DYNO_CSV_PROMPT}
            </pre>
          </Collapsible>
        </div>
        {readError && (
          <p className="mt-2 text-caption text-warning">
            {readError} Die Werte lassen sich unten von Hand eintragen.
          </p>
        )}
        {anchor && anchor.printedPs != null && (
          <p className={`mt-2 text-caption ${anchor.suspicious ? "text-warning" : "text-muted-foreground"}`}>
            Kurve auf den gedruckten Spitzenwert {anchor.printedPs.toFixed(1).replace(".", ",")} PS verankert
            (abgelesen {anchor.readPs?.toFixed(1).replace(".", ",")} PS, Faktor{" "}
            {anchor.scale.toFixed(3).replace(".", ",")}
            {anchor.rpmShift !== 0 && `, Drehzahl um ${anchor.rpmShift.toFixed(0)} U/min verschoben`}).
            {anchor.suspicious && ` Mehr als ${(ANCHOR_WARN * 100).toFixed(0)} % Abweichung – bitte die Wertetabelle gegen das Protokoll prüfen.`}
          </p>
        )}

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
