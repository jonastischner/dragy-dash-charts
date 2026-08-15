import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { Button, Field, Note, TextInput } from "@/components/dragy/ui";
import { errorMessage } from "@/lib/dragy/errors";
import { extractEventPdf, importFromSportityLink } from "@/lib/dragy/events";
import type { ExtractedScheduleEntry, ExtractedStage } from "@/types/events";
import { ExtractionReview } from "./ExtractionReview";
import { Modal } from "./Modal";

export function ImportSportityDialog({
  eventId,
  onClose,
  onImport,
  onFallbackToUpload,
}: {
  eventId: string;
  onClose: () => void;
  onImport: (result: {
    schedule: ExtractedScheduleEntry[];
    stages: ExtractedStage[];
  }) => Promise<void>;
  onFallbackToUpload: () => void;
}) {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<"link" | "importing" | "review" | "saving">("link");
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ExtractedScheduleEntry[]>([]);
  const [stages, setStages] = useState<ExtractedStage[]>([]);

  const startImport = async () => {
    if (!url.trim()) return;
    setError(null);
    setPhase("importing");
    try {
      const path = await importFromSportityLink(eventId, url.trim());
      const result = await extractEventPdf(path);
      setSchedule(result.schedule);
      setStages(result.stages);
      setPhase("review");
    } catch (e) {
      setError(errorMessage(e, "Import von Sportity ist fehlgeschlagen."));
      setPhase("link");
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
    <Modal title="Von Sportity importieren" onClose={onClose}>
      {error && (
        <div className="space-y-2">
          <Note>{error}</Note>
          <Button variant="secondary" onClick={onFallbackToUpload} className="w-full">
            PDF stattdessen direkt hochladen
          </Button>
        </div>
      )}

      {phase === "link" && (
        <div className="space-y-3">
          {!error && (
            <p className="text-caption text-muted-foreground">
              Füge den Link zur Sportity-Veranstaltungsseite ein. Wir versuchen, die Ausschreibung
              dort automatisch als PDF zu finden – das klappt nicht bei jeder Seite, dann kannst du
              die PDF stattdessen direkt hochladen.
            </p>
          )}
          <Field label="Sportity-Link">
            <TextInput
              type="url"
              inputMode="url"
              placeholder="https://www.sportity.de/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <Button onClick={startImport} disabled={!url.trim()} className="w-full">
            <Link2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Importieren
          </Button>
        </div>
      )}

      {phase === "importing" && (
        <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          <p className="text-caption">Sportity-Seite wird durchsucht und PDF ausgelesen…</p>
        </div>
      )}

      {(phase === "review" || phase === "saving") && (
        <div className="space-y-4">
          <p className="text-caption text-muted-foreground">
            Bitte prüfen und bei Bedarf korrigieren. Erst nach „Übernehmen“ werden die Einträge
            gespeichert.
          </p>

          <ExtractionReview
            schedule={schedule}
            setSchedule={setSchedule}
            stages={stages}
            setStages={setStages}
          />

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
