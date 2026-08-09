import { useState } from "react";
import { Upload } from "lucide-react";
import { Button, Field, NumInput, Note, TextArea } from "@/components/dragy/ui";
import type { Waypoint } from "@/types/trip";

export function TripMasterSettings({
  warningDistance,
  onWarningDistanceChange,
  onImportWaypoints,
}: {
  warningDistance: number;
  onWarningDistanceChange: (m: number) => void;
  onImportWaypoints: (rows: Array<Pick<Waypoint, "distance" | "name" | "note">>) => void;
}) {
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const importCsv = () => {
    const rows = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [d, name = "", note = ""] = line.split(";");
        const distance = Number(String(d).replace(",", "."));
        return Number.isFinite(distance) ? { distance, name: name.trim(), note: note.trim() } : null;
      })
      .filter((r): r is { distance: number; name: string; note: string } => r !== null);
    if (rows.length === 0) { setMsg("Keine gültigen Zeilen erkannt."); return; }
    onImportWaypoints(rows);
    setCsv("");
    setMsg(`${rows.length} Wegpunkt(e) importiert.`);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-subtitle text-foreground">Einstellungen</h2>
      <Field label="Vorwarn-Distanz (m)" hint="Gilt für alle Trips. Standard: 100 m.">
        <NumInput
          value={warningDistance}
          onChange={(e) => onWarningDistanceChange(Number(e.target.value) || 0)}
        />
      </Field>

      <div className="mt-4">
        <Field label="Wegpunkte als CSV importieren" hint="Format pro Zeile: Distanz;Name;Notiz">
          <TextArea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"1200;Achtung Kuppe;rechts halten\n3400;Tankstelle;Zeitkontrolle"} />
        </Field>
        <Button variant="secondary" onClick={importCsv} className="mt-3 w-full">
          <Upload className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          CSV importieren
        </Button>
        {msg && <p className="mt-2 text-caption text-muted-foreground">{msg}</p>}
      </div>

      <div className="mt-4">
        <Note>GPS wird derzeit simuliert. In der nativen App liefert das Gerät die Meter.</Note>
      </div>
    </div>
  );
}
