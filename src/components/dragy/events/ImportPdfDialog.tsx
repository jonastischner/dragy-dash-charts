import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Button, Note, TextInput } from "@/components/dragy/ui";
import { errorMessage } from "@/lib/dragy/errors";
import { extractEventPdf, uploadEventPdf } from "@/lib/dragy/events";
import type { ExtractedScheduleEntry, ExtractedStage } from "@/types/events";
import { Modal } from "./Modal";

// ISO-Zeitstempel <-> Wert für <input type="datetime-local"> (lokale Zeit, ohne Sekunden).
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromDatetimeLocal(local: string): string {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? local : d.toISOString();
}

export function ImportPdfDialog({
  eventId,
  onClose,
  onImport,
}: {
  eventId: string;
  onClose: () => void;
  onImport: (result: {
    schedule: ExtractedScheduleEntry[];
    stages: ExtractedStage[];
  }) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"pick" | "extracting" | "review" | "saving">("pick");
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ExtractedScheduleEntry[]>([]);
  const [stages, setStages] = useState<ExtractedStage[]>([]);

  const pickFile = async (file: File | null | undefined) => {
    if (!file) return;
    setError(null);
    setPhase("extracting");
    try {
      const path = await uploadEventPdf(eventId, file);
      const result = await extractEventPdf(path);
      setSchedule(result.schedule);
      setStages(result.stages);
      setPhase("review");
    } catch (e) {
      setError(errorMessage(e, "PDF konnte nicht verarbeitet werden."));
      setPhase("pick");
    }
  };

  const confirm = async () => {
    setPhase("saving");
    setError(null);
    try {
      await onImport({ schedule, stages });
      onClose();
    } catch (e) {
      setError(errorMessage(e, "Übernahme fehlgeschlagen."));
      setPhase("review");
    }
  };

  return (
    <Modal title="Ausschreibung importieren (PDF)" onClose={onClose}>
      {error && <Note>{error}</Note>}

      {phase === "pick" && (
        <div className="space-y-3">
          <p className="text-caption text-muted-foreground">
            Lade die Ausschreibung als PDF hoch. Zeitplan und WP-Plan werden automatisch ausgelesen
            – du prüfst und bestätigst die Daten danach, bevor irgendetwas gespeichert wird.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <Button onClick={() => inputRef.current?.click()} className="w-full">
            <Upload className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            PDF wählen…
          </Button>
        </div>
      )}

      {phase === "extracting" && (
        <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          <p className="text-caption">PDF wird hochgeladen und ausgelesen…</p>
        </div>
      )}

      {(phase === "review" || phase === "saving") && (
        <div className="space-y-4">
          <p className="text-caption text-muted-foreground">
            Bitte prüfen und bei Bedarf korrigieren. Erst nach „Übernehmen“ werden die Einträge
            gespeichert.
          </p>

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
                        setSchedule((s) =>
                          s.map((x, j) => (j === i ? { ...x, programmpunkt: v } : x)),
                        );
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

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onClose} disabled={phase === "saving"}>
              Abbrechen
            </Button>
            <Button
              onClick={confirm}
              loading={phase === "saving"}
              disabled={schedule.length === 0 && stages.length === 0}
            >
              Übernehmen
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
