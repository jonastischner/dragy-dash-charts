// Typen für Veranstaltungen (Rallye-Events): Zeitplan & WP-Plan.
// Datenhaltung läuft direkt über Supabase (kein lokaler IndexedDB-Store,
// erfordert Login) – siehe src/lib/dragy/events.ts.

export type EventSourceType = "sportity_link" | "pdf_upload";
export type EventStatus = "geplant" | "laufend" | "abgeschlossen";

export interface RallyeEvent {
  id: string;
  name: string;
  ort: string | null;
  datumStart: string | null; // ISO-Datum (YYYY-MM-DD)
  datumEnde: string | null;
  quelleTyp: EventSourceType | null;
  quelleReferenz: string | null;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EventScheduleEntry {
  id: string;
  eventId: string;
  uhrzeit: string; // ISO-Zeitstempel
  programmpunkt: string;
}

export interface EventStage {
  id: string;
  eventId: string;
  wpNummer: string | null;
  name: string;
  laengeKm: number | null;
  startUhrzeit: string | null; // ISO-Zeitstempel
}

/** Aus einer PDF-Ausschreibung extrahierte, noch nicht übernommene Einträge (Review-Schritt). */
export interface ExtractedScheduleEntry {
  uhrzeit: string;
  programmpunkt: string;
}

export interface ExtractedStage {
  wpNummer: string | null;
  name: string;
  laengeKm: number | null;
  startUhrzeit: string | null;
}

export interface ExtractionResult {
  schedule: ExtractedScheduleEntry[];
  stages: ExtractedStage[];
}
