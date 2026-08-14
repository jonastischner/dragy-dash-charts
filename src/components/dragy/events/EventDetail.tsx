import { useEffect, useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { Button, Field, IconButton, Note, Section, Select, Skeleton } from "@/components/dragy/ui";
import {
  addScheduleEntry,
  addStage,
  listSchedule,
  listStages,
  removeScheduleEntry,
  removeStage,
  updateEvent,
} from "@/lib/dragy/events";
import type { EventScheduleEntry, EventStage, EventStatus, RallyeEvent } from "@/types/events";
import { AddScheduleEntryDialog } from "./AddScheduleEntryDialog";
import { AddStageDialog } from "./AddStageDialog";
import { STATUS_LABEL, formatDateRange, formatDateTime } from "./format";

export function EventDetail({ event, onChanged }: { event: RallyeEvent; onChanged: () => void }) {
  const [schedule, setSchedule] = useState<EventScheduleEntry[]>([]);
  const [stages, setStages] = useState<EventStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "schedule" | "stage">(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, st] = await Promise.all([listSchedule(event.id), listStages(event.id)]);
      setSchedule(s);
      setStages(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Daten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [event.id]);

  return (
    <div>
      <Section title="Übersicht">
        {error && <Note>{error}</Note>}
        <div className="flex flex-wrap items-center gap-3 text-caption text-muted-foreground">
          {event.ort && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {event.ort}
            </span>
          )}
          {(event.datumStart || event.datumEnde) && (
            <span>{formatDateRange(event.datumStart, event.datumEnde)}</span>
          )}
        </div>
        <div className="mt-3">
          <Field label="Status">
            <Select
              value={event.status}
              onChange={async (e) => {
                await updateEvent(event.id, { status: e.target.value as EventStatus });
                onChanged();
              }}
            >
              {(Object.keys(STATUS_LABEL) as EventStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="Zeitplan">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : schedule.length === 0 ? (
          <p className="text-caption text-muted-foreground">Noch kein Zeitplan hinterlegt.</p>
        ) : (
          <ul className="space-y-2">
            {schedule.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-md border border-border bg-elevated px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="tabular-nums text-foreground">
                    {formatDateTime(entry.uhrzeit)}
                  </span>
                  <span className="ml-2 text-foreground">{entry.programmpunkt}</span>
                </div>
                <IconButton
                  label="Eintrag löschen"
                  onClick={async () => {
                    await removeScheduleEntry(entry.id);
                    reload();
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" onClick={() => setDialog("schedule")} className="mt-3 w-full">
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Zeitplan-Eintrag
        </Button>
      </Section>

      <Section title="WP-Plan">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : stages.length === 0 ? (
          <p className="text-caption text-muted-foreground">
            Noch keine Wertungsprüfungen hinterlegt.
          </p>
        ) : (
          <ul className="space-y-2">
            {stages.map((stage) => (
              <li
                key={stage.id}
                className="flex items-center gap-3 rounded-md border border-border bg-elevated px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  {stage.wpNummer && (
                    <span className="mr-2 rounded bg-secondary px-1.5 py-0.5 text-caption text-foreground">
                      WP {stage.wpNummer}
                    </span>
                  )}
                  <span className="text-foreground">{stage.name}</span>
                  <div className="text-caption text-muted-foreground">
                    {[
                      stage.laengeKm != null ? `${stage.laengeKm.toFixed(2)} km` : null,
                      stage.startUhrzeit ? formatDateTime(stage.startUhrzeit) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </div>
                <IconButton
                  label="Wertungsprüfung löschen"
                  onClick={async () => {
                    await removeStage(stage.id);
                    reload();
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" onClick={() => setDialog("stage")} className="mt-3 w-full">
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Wertungsprüfung
        </Button>
      </Section>

      {dialog === "schedule" && (
        <AddScheduleEntryDialog
          onClose={() => setDialog(null)}
          onAdd={async (input) => {
            await addScheduleEntry(event.id, input);
            setDialog(null);
            reload();
          }}
        />
      )}
      {dialog === "stage" && (
        <AddStageDialog
          onClose={() => setDialog(null)}
          onAdd={async (input) => {
            await addStage(event.id, input);
            setDialog(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
