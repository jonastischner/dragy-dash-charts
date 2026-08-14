import { useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Button, EmptyState, Note, Skeleton } from "@/components/dragy/ui";
import { useAppStore } from "@/lib/dragy/store";
import { createEvent, listEvents } from "@/lib/dragy/events";
import type { RallyeEvent } from "@/types/events";
import { EventDetail } from "./EventDetail";
import { NewEventDialog } from "./NewEventDialog";
import { STATUS_LABEL, formatDateRange } from "./format";

export function EventsWorkspace({
  onBack,
  onOpenAccount,
}: {
  onBack: () => void;
  onOpenAccount: () => void;
}) {
  const { userEmail } = useAppStore();
  const [events, setEvents] = useState<RallyeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "new">(null);

  const reload = async () => {
    if (!userEmail) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setEvents(await listEvents());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veranstaltungen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [userEmail]);

  const selected = events.find((e) => e.id === selectedId) ?? null;

  const header = (
    <div className="mb-4 flex items-start gap-3">
      <button
        onClick={selected ? () => setSelectedId(null) : onBack}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
        aria-label="Zurück"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div>
        <h2 className="text-body font-semibold text-foreground">
          {selected ? selected.name : "Veranstaltungen"}
        </h2>
        <p className="text-caption text-muted-foreground">
          {selected
            ? "Zeitplan und WP-Plan"
            : "Rallyes und andere Veranstaltungen zentral anlegen und verwalten."}
        </p>
      </div>
    </div>
  );

  if (!userEmail) {
    return (
      <div>
        {header}
        <EmptyState
          title="Login erforderlich"
          description="Veranstaltungen werden in der Cloud gespeichert. Bitte zuerst einloggen (unter „Mehr“)."
          actionLabel="Zum Login"
          onAction={onOpenAccount}
        />
      </div>
    );
  }

  if (selected) {
    return (
      <div>
        {header}
        <EventDetail event={selected} onChanged={reload} />
      </div>
    );
  }

  return (
    <div>
      {header}
      {error && <Note>{error}</Note>}

      <Button onClick={() => setDialog("new")} className="min-h-[48px]">
        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        Neue Veranstaltung
      </Button>

      <div className="mt-4 space-y-2">
        {loading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : events.length === 0 ? (
          <EmptyState
            title="Noch keine Veranstaltungen"
            description="Lege deine erste Rallye oder Veranstaltung an."
            actionLabel="Neue Veranstaltung"
            onAction={() => setDialog("new")}
          />
        ) : (
          events.map((ev) => (
            <button
              key={ev.id}
              onClick={() => setSelectedId(ev.id)}
              className="flex w-full items-start justify-between gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-ring"
            >
              <div className="min-w-0">
                <div className="text-body font-medium text-foreground truncate">{ev.name}</div>
                <div className="text-caption text-muted-foreground">
                  {[ev.ort, formatDateRange(ev.datumStart, ev.datumEnde)]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </div>
              </div>
              <span className="flex-none rounded bg-secondary px-2 py-1 text-caption text-foreground">
                {STATUS_LABEL[ev.status]}
              </span>
            </button>
          ))
        )}
      </div>

      {dialog === "new" && (
        <NewEventDialog
          onClose={() => setDialog(null)}
          onCreate={async (input) => {
            const created = await createEvent(input);
            setDialog(null);
            await reload();
            setSelectedId(created.id);
          }}
        />
      )}
    </div>
  );
}
