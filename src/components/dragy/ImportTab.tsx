import { useRef, useState } from "react";
import { Section, Field, TextInput, NumInput, Button, Note, Row, EmptyState, usePersistedState } from "./ui";
import { useAppStore } from "@/lib/dragy/store";
import { parseUbx } from "@/lib/dragy/ubx";
import { parseTableFile } from "@/lib/dragy/tabular";
import { nameImportedSession } from "@/lib/dragy/sessionTime";
import { uid } from "@/lib/dragy/db";
import { STD_ENV } from "@/lib/dragy/physics";
import type { Session, ManualRow, Record as R, ModuleId } from "@/lib/dragy/types";


export function ImportTab({ module = "power", onOpenVehicles }: { module?: ModuleId; onOpenVehicles?: () => void } = {}) {
  const { state, saveSession } = useAppStore();
  const activeVehicle = state.vehicles.find((v) => v.id === state.activeVehicleId);
  const inputRef = useRef<HTMLInputElement>(null);
  // Leer = nicht angegeben. Für die Luftdichte greifen dann die Standardwerte
  // (STD_ENV), eine Normkorrektur unterbleibt.
  const [tempC, setTempC] = useState<number | undefined>(undefined);
  const [pressureHpa, setPressureHpa] = useState<number | undefined>(undefined);
  const [rh, setRh] = useState<number | undefined>(undefined);
  const [log, setLog] = useState<string[]>([]);
  const [manualOpen, setManualOpen] = useState(false);

  if (!activeVehicle) return <Section title="Import"><EmptyState title="Kein aktives Fahrzeug" description="Import benötigt ein aktives Fahrzeug." actionLabel="Fahrzeug anlegen" onAction={onOpenVehicles} /></Section>;


  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    const msgs: string[] = [];
    for (const f of Array.from(files)) {
      try {
        const isTable = /\.(csv|txt|tsv|xlsx|xlsm|xls)$/i.test(f.name);
        let records: R[];
        let extra = "";
        // Tabellen-Exporte tragen keine absolute Zeit, nur eine relative
        // Zeitachse – dort bleibt startedAt null und der Dateiname greift.
        let startedAt: number | null = null;
        if (isTable) {
          const res = await parseTableFile(f);
          records = res.records;
          extra = ` – ${res.info}`;
          if (records.length < 3) { msgs.push(`${f.name}: zu wenige Datenzeilen gefunden`); continue; }
        } else {
          const res = parseUbx(await f.arrayBuffer());
          records = res.records;
          startedAt = res.startedAt;
          if (records.length < 3) { msgs.push(`${f.name}: keine gültigen NAV-PVT Datensätze gefunden`); continue; }
        }
        const { recordedAt, name } = nameImportedSession(f.name, startedAt);
        const s: Session = {
          id: uid(), vehicleId: activeVehicle.id, name,
          records, tempC, pressureHpa, rh, manual: false, createdAt: Date.now(), module,
          ...(recordedAt != null ? { recordedAt } : {}),
        };
        await saveSession(s);
        const when = recordedAt != null ? `„${name}"` : `${name} (keine Aufnahmezeit in der Datei)`;
        msgs.push(`${f.name}: ${records.length} Punkte importiert (${records[records.length - 1].t.toFixed(1)} s) als ${when}${extra}`);
      } catch (e: any) {
        msgs.push(`${f.name}: Fehler – ${e.message ?? e}`);
      }
    }
    setLog(msgs);
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
        <p className="text-caption text-muted-foreground">Aktives Fahrzeug: <b>{activeVehicle.name}</b>. Mehrfachauswahl möglich – eine Datei = eine Session.</p>
        <Note>Neben Dragy-Rohdaten werden Tabellen-Exporte (z.B. P-Gear, Racebox) als CSV/TSV oder Excel gelesen. Erkannt werden Spalten für Geschwindigkeit (km/h oder mph), Zeit, Strecke und Höhe; fehlt eine Zeitspalte, wird die Abtastrate aus Strecke und Geschwindigkeit abgeleitet.</Note>
        <input ref={inputRef} type="file" accept=".data,.ubx,.csv,.tsv,.txt,.xlsx,.xlsm,.xls,application/octet-stream" multiple className="hidden"
          onChange={(e) => importFiles(e.target.files)} />
        <div className="mt-2 flex gap-2">
          <Button onClick={() => inputRef.current?.click()}>Dateien wählen…</Button>
          <Button variant="secondary" onClick={() => setManualOpen(true)}>Manuell eingeben…</Button>

        </div>
        {log.length > 0 && (
          <ul className="mt-2 space-y-1 text-caption text-muted-foreground">
            {log.map((l, i) => <li key={i}>• {l}</li>)}
          </ul>
        )}
      </Section>

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
