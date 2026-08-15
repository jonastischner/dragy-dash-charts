import type { Dispatch, SetStateAction } from "react";
import { Trash2 } from "lucide-react";
import { TextInput } from "@/components/dragy/ui";
import type { ExtractedScheduleEntry, ExtractedStage } from "@/types/events";

// Geteilte Review-Liste für Teil 2 (PDF-Upload) und Teil 3 (Sportity-Link) –
// beide Import-Wege münden in dieselbe Extraktion und denselben
// Korrektur-Schritt vor dem Speichern.

// ISO-Zeitstempel <-> Wert für <input type="datetime-local"> (lokale Zeit, ohne Sekunden).
export function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromDatetimeLocal(local: string): string {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? local : d.toISOString();
}

export function ExtractionReview({
  schedule,
  setSchedule,
  stages,
  setStages,
}: {
  schedule: ExtractedScheduleEntry[];
  setSchedule: Dispatch<SetStateAction<ExtractedScheduleEntry[]>>;
  stages: ExtractedStage[];
  setStages: Dispatch<SetStateAction<ExtractedStage[]>>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-caption font-semibold text-foreground">
          Zeitplan ({schedule.length})
        </h3>
        {schedule.length === 0 ? (
          <p className="text-caption text-muted-foreground">Keine Einträge erkannt.</p>
        ) : (
          <div className="space-y-2">
            {schedule.map((entry, i) => (
              <div key={i} className="flex items-center gap-2">
                <TextInput
                  type="datetime-local"
                  value={toDatetimeLocal(entry.uhrzeit)}
                  onChange={(e) => {
                    const v = fromDatetimeLocal(e.target.value);
                    setSchedule((s) => s.map((x, j) => (j === i ? { ...x, uhrzeit: v } : x)));
                  }}
                  className="w-[190px] flex-none"
                />
                <TextInput
                  value={entry.programmpunkt}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSchedule((s) => s.map((x, j) => (j === i ? { ...x, programmpunkt: v } : x)));
                  }}
                  className="flex-1"
                />
                <button
                  type="button"
                  aria-label="Eintrag entfernen"
                  onClick={() => setSchedule((s) => s.filter((_, j) => j !== i))}
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-caption font-semibold text-foreground">
          WP-Plan ({stages.length})
        </h3>
        {stages.length === 0 ? (
          <p className="text-caption text-muted-foreground">Keine Einträge erkannt.</p>
        ) : (
          <div className="space-y-2">
            {stages.map((stage, i) => (
              <div key={i} className="flex items-center gap-2">
                <TextInput
                  value={stage.wpNummer ?? ""}
                  placeholder="WP-Nr."
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setStages((s) => s.map((x, j) => (j === i ? { ...x, wpNummer: v } : x)));
                  }}
                  className="w-16 flex-none"
                />
                <TextInput
                  value={stage.name}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStages((s) => s.map((x, j) => (j === i ? { ...x, name: v } : x)));
                  }}
                  className="flex-1"
                />
                <TextInput
                  type="number"
                  step="0.01"
                  value={stage.laengeKm ?? ""}
                  placeholder="km"
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    setStages((s) => s.map((x, j) => (j === i ? { ...x, laengeKm: v } : x)));
                  }}
                  className="w-20 flex-none"
                />
                <button
                  type="button"
                  aria-label="WP entfernen"
                  onClick={() => setStages((s) => s.filter((_, j) => j !== i))}
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
