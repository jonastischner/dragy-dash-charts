// Datenzugriff für Veranstaltungen – direkt gegen Supabase, kein lokaler
// Store/Sync wie bei Fahrzeugen/Sessions. Erfordert einen eingeloggten
// Nutzer (RLS: auth.uid() = user_id); ohne Login schlagen alle Aufrufe fehl.

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type {
  EventScheduleEntry,
  EventSourceType,
  EventStage,
  EventStatus,
  ExtractionResult,
  RallyeEvent,
} from "@/types/events";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type ScheduleRow = Database["public"]["Tables"]["event_schedule"]["Row"];
type StageRow = Database["public"]["Tables"]["event_stages"]["Row"];

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Bitte einloggen, um Veranstaltungen zu verwalten.");
  return data.user.id;
}

function mapEvent(row: EventRow): RallyeEvent {
  return {
    id: row.id,
    name: row.name,
    ort: row.ort,
    datumStart: row.datum_start,
    datumEnde: row.datum_ende,
    quelleTyp: row.quelle_typ as EventSourceType | null,
    quelleReferenz: row.quelle_referenz,
    status: row.status as EventStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSchedule(row: ScheduleRow): EventScheduleEntry {
  return {
    id: row.id,
    eventId: row.event_id,
    uhrzeit: row.uhrzeit,
    programmpunkt: row.programmpunkt,
  };
}

function mapStage(row: StageRow): EventStage {
  return {
    id: row.id,
    eventId: row.event_id,
    wpNummer: row.wp_nummer,
    name: row.name,
    laengeKm: row.laenge_km,
    startUhrzeit: row.start_uhrzeit,
  };
}

export async function listEvents(): Promise<RallyeEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("datum_start", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}

export async function createEvent(input: {
  name: string;
  ort?: string | null;
  datumStart?: string | null;
  datumEnde?: string | null;
  quelleTyp?: EventSourceType | null;
  quelleReferenz?: string | null;
}): Promise<RallyeEvent> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("events")
    .insert({
      user_id: userId,
      name: input.name,
      ort: input.ort ?? null,
      datum_start: input.datumStart ?? null,
      datum_ende: input.datumEnde ?? null,
      quelle_typ: input.quelleTyp ?? null,
      quelle_referenz: input.quelleReferenz ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapEvent(data);
}

export async function updateEvent(
  id: string,
  patch: Partial<{
    name: string;
    ort: string | null;
    datumStart: string | null;
    datumEnde: string | null;
    quelleTyp: EventSourceType | null;
    quelleReferenz: string | null;
    status: EventStatus;
  }>,
): Promise<RallyeEvent> {
  const { data, error } = await supabase
    .from("events")
    .update({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.ort !== undefined && { ort: patch.ort }),
      ...(patch.datumStart !== undefined && { datum_start: patch.datumStart }),
      ...(patch.datumEnde !== undefined && { datum_ende: patch.datumEnde }),
      ...(patch.quelleTyp !== undefined && { quelle_typ: patch.quelleTyp }),
      ...(patch.quelleReferenz !== undefined && { quelle_referenz: patch.quelleReferenz }),
      ...(patch.status !== undefined && { status: patch.status }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapEvent(data);
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw error;
}

export async function listSchedule(eventId: string): Promise<EventScheduleEntry[]> {
  const { data, error } = await supabase
    .from("event_schedule")
    .select("*")
    .eq("event_id", eventId)
    .order("uhrzeit", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapSchedule);
}

export async function addScheduleEntry(
  eventId: string,
  input: { uhrzeit: string; programmpunkt: string },
): Promise<EventScheduleEntry> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("event_schedule")
    .insert({
      user_id: userId,
      event_id: eventId,
      uhrzeit: input.uhrzeit,
      programmpunkt: input.programmpunkt,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapSchedule(data);
}

export async function removeScheduleEntry(id: string): Promise<void> {
  const { error } = await supabase.from("event_schedule").delete().eq("id", id);
  if (error) throw error;
}

export async function listStages(eventId: string): Promise<EventStage[]> {
  const { data, error } = await supabase
    .from("event_stages")
    .select("*")
    .eq("event_id", eventId)
    .order("start_uhrzeit", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map(mapStage);
}

export async function addStage(
  eventId: string,
  input: {
    wpNummer?: string | null;
    name: string;
    laengeKm?: number | null;
    startUhrzeit?: string | null;
  },
): Promise<EventStage> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("event_stages")
    .insert({
      user_id: userId,
      event_id: eventId,
      wp_nummer: input.wpNummer ?? null,
      name: input.name,
      laenge_km: input.laengeKm ?? null,
      start_uhrzeit: input.startUhrzeit ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapStage(data);
}

export async function removeStage(id: string): Promise<void> {
  const { error } = await supabase.from("event_stages").delete().eq("id", id);
  if (error) throw error;
}

// Teil 2: PDF-Upload + Extraktion. Die Extraktion selbst schreibt nichts in
// event_schedule/event_stages – das Frontend zeigt sie erst zur Review an;
// erst addScheduleEntry/addStage (nach Bestätigung) persistiert etwas.

export async function uploadEventPdf(eventId: string, file: File): Promise<string> {
  const userId = await requireUserId();
  const path = `${userId}/${eventId}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage
    .from("event-ausschreibungen")
    .upload(path, file, { contentType: "application/pdf", upsert: false });
  if (error) throw error;

  await updateEvent(eventId, { quelleTyp: "pdf_upload", quelleReferenz: path });
  return path;
}

async function invokeEventFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    const context = (error as { context?: { text?: () => Promise<string> } }).context;
    let serverMessage: string | undefined;
    if (context?.text) {
      try {
        const raw = await context.text();
        try {
          serverMessage = JSON.parse(raw)?.error;
        } catch {
          // Body ist kein JSON (z. B. ein Boot-/Laufzeitfehler der Function) –
          // Rohtext zeigen statt der uninformativen generischen Meldung.
          if (raw.trim()) serverMessage = raw.trim().slice(0, 300);
        }
      } catch {
        // Body nicht lesbar – Fallback auf die generische Meldung unten.
      }
    }
    throw new Error(serverMessage ?? error.message ?? "Anfrage fehlgeschlagen.");
  }
  if (!data) throw new Error("Die Anfrage hat keine Daten geliefert.");
  return data;
}

export async function extractEventPdf(storagePath: string): Promise<ExtractionResult> {
  return invokeEventFunction<ExtractionResult>("extract-event-pdf", { storagePath });
}

// Teil 3: Sportity-Link als Komfort-Import. Lädt (serverseitig) die
// verlinkte Sportity-Seite, sucht darauf die Ausschreibungs-PDF, legt sie
// im selben Bucket wie ein manueller Upload ab und liefert den Storage-Pfad
// zurück – die eigentliche Extraktion läuft danach unverändert über
// extractEventPdf() (dieselbe Pipeline wie beim manuellen Upload).
export async function importFromSportityLink(
  eventId: string,
  sportityUrl: string,
): Promise<string> {
  const { storagePath } = await invokeEventFunction<{ storagePath: string }>(
    "import-sportity-link",
    {
      eventId,
      sportityUrl,
    },
  );
  return storagePath;
}
