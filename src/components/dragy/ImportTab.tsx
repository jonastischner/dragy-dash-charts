import { useRef, useState } from "react";
import { Section, Field, TextInput, NumInput, Select, Button, Note, Row, EmptyState } from "./ui";
import { useAppStore, nextUnusedColor } from "@/lib/dragy/store";
import { parseUbx } from "@/lib/dragy/ubx";
import { parseTableFile } from "@/lib/dragy/tabular";
import { compareSessionsDesc, formatSessionTime, nameImportedSession } from "@/lib/dragy/sessionTime";
import { appendDynoRunToSession, appendRunToSession } from "@/lib/dragy/sessionMerge";
import { sessionModule } from "@/lib/dragy/modules";
import { uid } from "@/lib/dragy/db";
import { errorMessage } from "@/lib/dragy/errors";
import { STD_ENV } from "@/lib/dragy/physics";
import { DynoImportDialog, type DynoDraft } from "./DynoImportDialog";
import type { Session, Segment, ManualRow, Record as R, ModuleId } from "@/lib/dragy/types";

/**
 * Wohin die gewählten Dateien wandern. Wer vor jeder Messung das Gerät neu
 * startet, bekommt pro Lauf eine Datei – fachlich sind das Läufe einer
 * Ausfahrt, keine getrennten Sessions.
 */
type ImportTarget = "perFile" | "oneSession" | "append";
const TARGET_LABEL: Record<ImportTarget, string> = {
  perFile: "Je Datei eine eigene Session",
  oneSession: "Alle Dateien als eine neue Session",
  append: "An bestehende Session anhängen",
};


export function ImportTab({ module = "power", onOpenVehicles }: { module?: ModuleId; onOpenVehicles?: () => void } = {}) {
  const { state, saveSession, saveSegment } = useAppStore();
  const activeVehicle = state.vehicles.find((v) => v.id === state.activeVehicleId);
  const inputRef = useRef<HTMLInputElement>(null);
  // Leer = nicht angegeben. Für die Luftdichte greifen dann die Standardwerte
  // (STD_ENV), eine Normkorrektur unterbleibt.
  const [tempC, setTempC] = useState<number | undefined>(undefined);
  const [pressureHpa, setPressureHpa] = useState<number | undefined>(undefined);
  const [rh, setRh] = useState<number | undefined>(undefined);
  const [log, setLog] = useState<string[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [dynoOpen, setDynoOpen] = useState(false);
  const [target, setTarget] = useState<ImportTarget>("perFile");
  const [targetSessionId, setTargetSessionId] = useState<string>("");

  if (!activeVehicle) return <Section title="Import"><EmptyState title="Kein aktives Fahrzeug" description="Import benötigt ein aktives Fahrzeug." actionLabel="Fahrzeug anlegen" onAction={onOpenVehicles} /></Section>;


  // Sessions des aktiven Fahrzeugs in diesem Modul – Ziel für "anhängen".
  const appendable = [...state.sessions]
    .filter((s) => s.vehicleId === activeVehicle.id && sessionModule(s) === module && !s.manual)
    .sort(compareSessionsDesc);

  /** Eine Datei einlesen. Wirft bei zu wenigen Punkten. */
  const readFile = async (f: File): Promise<{ records: R[]; startedAt: number | null; extra: string }> => {
    const isTable = /\.(csv|txt|tsv|xlsx|xlsm|xls)$/i.test(f.name);
    if (isTable) {
      const res = await parseTableFile(f);
      if (res.records.length < 3) throw new Error("zu wenige Datenzeilen gefunden");
      // Tabellen-Exporte tragen keine absolute Zeit, nur eine relative Zeitachse.
      return { records: res.records, startedAt: null, extra: ` – ${res.info}` };
    }
    const res = parseUbx(await f.arrayBuffer());
    if (res.records.length < 3) throw new Error("keine gültigen NAV-PVT Datensätze gefunden");
    return { records: res.records, startedAt: res.startedAt, extra: "" };
  };

  const importFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const msgs: string[] = [];

    // Farben modulweit eindeutig halten, auch über mehrere Dateien hinweg.
    const ownIds = new Set(state.sessions.filter((s) => s.vehicleId === activeVehicle.id).map((s) => s.id));
    const usedColors = state.segments.filter((g) => ownIds.has(g.sessionId)).map((g) => g.color);

    if (target === "perFile") {
      for (const f of list) {
        try {
          const { records, startedAt, extra } = await readFile(f);
          const { recordedAt, name } = nameImportedSession(f.name, startedAt);
          await saveSession({
            id: uid(), vehicleId: activeVehicle.id, name,
            records, tempC, pressureHpa, rh, manual: false, createdAt: Date.now(), module,
            ...(recordedAt != null ? { recordedAt } : {}),
          });
          const when = recordedAt != null ? `„${name}"` : `${name} (keine Aufnahmezeit in der Datei)`;
          msgs.push(`${f.name}: ${records.length} Punkte importiert (${records[records.length - 1].t.toFixed(1)} s) als ${when}${extra}`);
        } catch (e) {
          msgs.push(`${f.name}: Fehler – ${errorMessage(e, "Import fehlgeschlagen")}`);
        }
      }
      setLog(msgs);
      return;
    }

    // Sammelmodus: jede Datei wird ein Lauf derselben Session.
    let session: Session | null = null;
    if (target === "append") {
      session = state.sessions.find((s) => s.id === targetSessionId) ?? null;
      if (!session) { setLog(["Keine Ziel-Session gewählt."]); return; }
    }

    const segments: Segment[] = [];
    let runNo = target === "append"
      ? state.segments.filter((g) => g.sessionId === targetSessionId).length
      : 0;

    for (const f of list) {
      try {
        const { records, startedAt, extra } = await readFile(f);
        if (!session) {
          // Erste Datei einer neuen Sammel-Session: sie gibt Name und Datum vor.
          const { recordedAt, name } = nameImportedSession(f.name, startedAt);
          session = {
            id: uid(), vehicleId: activeVehicle.id, name,
            records: [], tempC, pressureHpa, rh, manual: false, createdAt: Date.now(), module,
            ...(recordedAt != null ? { recordedAt } : {}),
          };
        }
        runNo += 1;
        const res = appendRunToSession(session, records, {
          name: `Lauf ${runNo}`,
          color: nextUnusedColor([...usedColors, ...segments.map((g) => g.color)]),
          rpmFactor: activeVehicle.rpmFactorDefault,
          startedAt,
        });
        session = res.session;
        segments.push(res.segment);
        msgs.push(`${f.name}: ${records.length} Punkte als „Lauf ${runNo}"${extra}`);
      } catch (e) {
        msgs.push(`${f.name}: Fehler – ${errorMessage(e, "Import fehlgeschlagen")}`);
      }
    }

    if (session && segments.length > 0) {
      await saveSession(session);
      for (const g of segments) await saveSegment(g);
      msgs.push(`→ ${segments.length} Lauf/Läufe in Session „${session.name}"`);
      if (target === "oneSession") setTarget("perFile");
    }
    setLog(msgs);
  };

  /**
   * Einen gemessenen Prüfstandslauf ablegen: entweder an die gewählte Session
   * anhängen oder eine neue anlegen. Die Session bleibt ohne Records – die
   * Kurve steckt im Lauf.
   */
  const saveDynoRun = async (draft: DynoDraft) => {
    const ownIds = new Set(state.sessions.filter((s) => s.vehicleId === activeVehicle.id).map((s) => s.id));
    const usedColors = state.segments.filter((g) => ownIds.has(g.sessionId)).map((g) => g.color);

    const existingSession = target === "append"
      ? state.sessions.find((s) => s.id === targetSessionId) ?? null
      : null;
    const measuredAt = draft.run.measuredAt;
    const session: Session = existingSession ?? {
      id: uid(), vehicleId: activeVehicle.id,
      name: measuredAt != null ? formatSessionTime(measuredAt) : "Prüfstandsmessung",
      records: [], tempC: undefined, pressureHpa: undefined, rh: undefined,
      manual: false, createdAt: Date.now(), module,
      ...(measuredAt != null ? { recordedAt: measuredAt } : {}),
    };
    const existing = state.segments.filter((g) => g.sessionId === session.id);
    const segment = appendDynoRunToSession(session, draft.run, {
      name: draft.name,
      color: nextUnusedColor(usedColors),
      rpmFactor: draft.rpmFactor,
      existing,
    });
    if (!existingSession) await saveSession(session);
    await saveSegment(segment);
    setDynoOpen(false);
    setLog([`Prüfstandslauf „${draft.name}" mit ${draft.run.points.length} Messpunkten in Session „${session.name}" gespeichert.`]);
  };

  return (
    <div>
      <Section title="Umgebungsdaten (für Luftdichte)">
        <Row>
          <Field label="Temperatur (°C)" hint="leer = nicht gemessen"><NumInput allowEmpty placeholder={`${STD_ENV.tempC}`} value={tempC ?? ""} onChange={(e) => setTempC(e.target.value === "" ? undefined : +e.target.value)} /></Field>
          <Field label="Luftdruck (hPa)" hint="leer = nicht gemessen"><NumInput allowEmpty placeholder={`${STD_ENV.pressureHpa}`} value={pressureHpa ?? ""} onChange={(e) => setPressureHpa(e.target.value === "" ? undefined : +e.target.value)} /></Field>
          <Field label="Rel. Luftfeuchte (%)" hint="leer = nicht gemessen"><NumInput allowEmpty placeholder={`${STD_ENV.rh}`} value={rh ?? ""} onChange={(e) => setRh(e.target.value === "" ? undefined : +e.target.value)} /></Field>
        </Row>
      </Section>

      <Section title="Läufe importieren (.data / .ubx / .csv / Excel)">
        <p className="text-caption text-muted-foreground">Aktives Fahrzeug: <b>{activeVehicle.name}</b>. Mehrfachauswahl möglich.</p>
        <Note>Neben Dragy-Rohdaten werden Tabellen-Exporte (z.B. P-Gear, Racebox) als CSV/TSV oder Excel gelesen. Erkannt werden Spalten für Geschwindigkeit (km/h oder mph), Zeit, Strecke und Höhe; fehlt eine Zeitspalte, wird die Abtastrate aus Strecke und Geschwindigkeit abgeleitet.</Note>

        <div className="mt-2">
          <Field
            label="Ziel"
            hint={
              target === "perFile"
                ? "Wie bisher: jede Datei wird eine eigene Session, Läufe darin erkennst du danach selbst."
                : "Jede Datei wird ein eigener Lauf und umfasst zunächst die ganze Datei – Grenzen lassen sich danach am Lauf anpassen. Die Zeitachsen werden hintereinandergelegt, die Aufnahmezeit je Lauf bleibt erhalten."
            }
          >
            <Select value={target} onChange={(e) => setTarget(e.target.value as ImportTarget)}>
              {(Object.keys(TARGET_LABEL) as ImportTarget[]).map((t) => (
                <option key={t} value={t} disabled={t === "append" && appendable.length === 0}>
                  {TARGET_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {target === "append" && (
          <div className="mt-2">
            <Field label="Ziel-Session">
              <Select value={targetSessionId} onChange={(e) => setTargetSessionId(e.target.value)}>
                <option value="">– Session wählen –</option>
                {appendable.map((s) => {
                  const n = state.segments.filter((g) => g.sessionId === s.id).length;
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name} ({n} {n === 1 ? "Lauf" : "Läufe"})
                    </option>
                  );
                })}
              </Select>
            </Field>
          </div>
        )}
        <input ref={inputRef} type="file" accept=".data,.ubx,.csv,.tsv,.txt,.xlsx,.xlsm,.xls,application/octet-stream" multiple className="hidden"
          onChange={(e) => importFiles(e.target.files)} />
        <div className="mt-2 flex gap-2">
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={target === "append" && !targetSessionId}
          >
            Dateien wählen…
          </Button>
          <Button variant="secondary" onClick={() => setManualOpen(true)}>Manuell eingeben…</Button>
          <Button variant="secondary" onClick={() => setDynoOpen(true)}>Prüfstandsprotokoll…</Button>

        </div>
        {log.length > 0 && (
          <ul className="mt-2 space-y-1 text-caption text-muted-foreground">
            {log.map((l, i) => <li key={i}>• {l}</li>)}
          </ul>
        )}
      </Section>

      {dynoOpen && (
        <DynoImportDialog
          defaultRpmFactor={activeVehicle.rpmFactorDefault}
          onCancel={() => setDynoOpen(false)}
          onSave={saveDynoRun}
        />
      )}

      {manualOpen && (
        <ManualEditor
          module={module} tempC={tempC} pressureHpa={pressureHpa} rh={rh}
          onCancel={() => setManualOpen(false)}
          onSave={async (session) => { await saveSession(session); setManualOpen(false); }}
          vehicleId={activeVehicle.id}
        />
      )}
    </div>
  );
}

function defaultRows(): ManualRow[] {
  const out: ManualRow[] = [];
  for (let v = 0; v <= 200; v += 10) out.push({ speedKmh: v, t: null });
  return out;
}

function ManualEditor({ vehicleId, module, tempC, pressureHpa, rh, onSave, onCancel }: {
  vehicleId: string; module: ModuleId; tempC?: number; pressureHpa?: number; rh?: number;
  onSave: (s: Session) => void; onCancel: () => void;
}) {
  const [name, setName] = useState("Manuelle Session");
  const [rows, setRows] = useState<ManualRow[]>(defaultRows());

  const update = (i: number, patch: Partial<ManualRow>) => {
    const arr = rows.slice(); arr[i] = { ...arr[i], ...patch }; setRows(arr);
  };
  const addRow = () => setRows([...rows, { speedKmh: 0, t: null }]);
  const delRow = (i: number) => setRows(rows.filter((_, k) => k !== i));

  const save = () => {
    const valid = rows.filter((r) => r.t !== null && Number.isFinite(r.t) && r.t >= 0 && Number.isFinite(r.speedKmh))
      .sort((a, b) => (a.t as number) - (b.t as number));
    if (valid.length < 3) return alert("Mindestens 3 gültige Zeilen benötigt.");
    const records: R[] = valid.map((r) => ({ t: r.t as number, speedKmh: r.speedKmh, heightM: 0 }));
    onSave({
      id: uid(), vehicleId, name, records, tempC, pressureHpa, rh,
      manual: true, manualRows: rows, createdAt: Date.now(), module,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-neutral-0/70 p-4 sm:items-center" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-card p-4 sm:rounded-xl">
        <h3 className="mb-2 text-base font-semibold text-foreground">Manuelle Session</h3>
        <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Note>Bei manuellen Sessions ist die Geschwindigkeits-Glättung deaktiviert (zu wenige Stützpunkte).</Note>
        <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2 text-caption text-muted-foreground">
          <div>Geschw. (km/h)</div><div>Zeit (s)</div><div></div>
        </div>
        <div className="mt-1 space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <NumInput value={r.speedKmh} onChange={(e) => update(i, { speedKmh: +e.target.value })} />
              <NumInput value={r.t ?? ""} onChange={(e) => update(i, { t: e.target.value === "" ? null : +e.target.value })} />
              <Button variant="danger" onClick={() => delRow(i)}>×</Button>
            </div>
          ))}
        </div>
        <Button className="mt-2" variant="secondary" onClick={addRow}>+ Zeile</Button>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
          <Button onClick={save}>Session speichern</Button>
        </div>
      </div>
    </div>
  );
}
