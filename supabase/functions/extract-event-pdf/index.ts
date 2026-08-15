// Teil 2 (Veranstaltungen): Nimmt eine bereits hochgeladene Ausschreibungs-PDF
// (Storage-Pfad) entgegen, lässt Claude Zeitplan und WP-Plan als strukturiertes
// JSON extrahieren und gibt das Ergebnis zur Review durchs Frontend zurück.
// Es wird bewusst NICHT direkt in event_schedule/event_stages geschrieben –
// das Frontend zeigt die Extraktion erst zur Kontrolle/Korrektur an.

// Bewusst ungepinnt: Deno löst dies beim Deploy gegen die aktuelle
// npm-"latest"-Version auf. Aus dieser Sandbox lässt sich die zum
// Zeitpunkt des Deploys tatsächlich aktuelle Version nicht prüfen (kein
// Netzzugriff auf npm) – ein geratener fester Versionsstand wäre riskanter
// als "latest", da er neuere API-Features (adaptive thinking, strict
// tool_choice, refusal stop_reason) fehlen lassen könnte.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2.110.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Bewusst ohne externe Base64-Bibliothek (kein jsr:@std/encoding) – nur
// eingebaute btoa()/String.fromCharCode(), in Chunks um Call-Stack-Limits
// bei großen PDFs zu vermeiden. Reduziert das Risiko eines Boot-Fehlers
// durch einen von Supabase' Edge-Runtime evtl. nicht unterstützten
// Import-Specifier.
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EXTRACT_TOOL = {
  name: "extract_event_data",
  description:
    "Extrahiert den Zeitplan und den Wertungsprüfungs-Plan (WP-Plan) aus einer Rallye-Ausschreibung.",
  input_schema: {
    type: "object" as const,
    properties: {
      schedule: {
        type: "array",
        description:
          "Zeitplan-Einträge der Veranstaltung (z. B. administrative Abnahme, Fahrerbesprechung, Start).",
        items: {
          type: "object",
          properties: {
            uhrzeit: {
              type: "string",
              description:
                "Datum+Uhrzeit als ISO-8601 (z. B. 2026-09-12T08:00:00). Fehlt das Datum im Text, das Veranstaltungsdatum verwenden, falls aus dem Dokument ableitbar.",
            },
            programmpunkt: { type: "string", description: "Bezeichnung des Programmpunkts." },
          },
          required: ["uhrzeit", "programmpunkt"],
          additionalProperties: false,
        },
      },
      stages: {
        type: "array",
        description: "Wertungsprüfungen (WP) des WP-Plans.",
        items: {
          type: "object",
          properties: {
            wpNummer: {
              anyOf: [{ type: "string" }, { type: "null" }],
              description: "WP-Nummer, z. B. '3' oder '3a'. Null falls nicht angegeben.",
            },
            name: { type: "string", description: "Name/Ort der Wertungsprüfung." },
            laengeKm: {
              anyOf: [{ type: "number" }, { type: "null" }],
              description: "Länge der WP in Kilometern. Null falls nicht angegeben.",
            },
            startUhrzeit: {
              anyOf: [{ type: "string" }, { type: "null" }],
              description: "Start-Datum+Uhrzeit als ISO-8601, falls angegeben, sonst null.",
            },
          },
          required: ["wpNummer", "name", "laengeKm", "startUhrzeit"],
          additionalProperties: false,
        },
      },
    },
    required: ["schedule", "stages"],
    additionalProperties: false,
  },
  strict: true,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError(401, "Bitte einloggen, um eine Ausschreibung zu importieren.");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return jsonError(401, "Bitte einloggen, um eine Ausschreibung zu importieren.");
    }

    let storagePath: unknown;
    try {
      ({ storagePath } = await req.json());
    } catch {
      return jsonError(400, "Ungültige Anfrage.");
    }
    if (!storagePath || typeof storagePath !== "string") {
      return jsonError(400, "Kein Dateipfad angegeben.");
    }

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("event-ausschreibungen")
      .download(storagePath);
    if (downloadError || !fileBlob) {
      return jsonError(404, "Die hochgeladene PDF konnte nicht gefunden werden.");
    }

    const pdfBytes = new Uint8Array(await fileBlob.arrayBuffer());
    const base64Pdf = bytesToBase64(pdfBytes);

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonError(
        500,
        "Die PDF-Extraktion ist serverseitig nicht konfiguriert (ANTHROPIC_API_KEY fehlt).",
      );
    }
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const message = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 8192,
      // Forciertes tool_choice erzwingt strukturierte Ausgabe zuverlässig,
      // ist aber nicht mit aktivem Thinking kombinierbar – für diese
      // gebundene Extraktionsaufgabe ist das der richtige Trade-off.
      thinking: { type: "disabled" },
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "extract_event_data" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64Pdf },
            },
            {
              type: "text",
              text:
                "Dies ist die Ausschreibung einer Rallye/Veranstaltung. Extrahiere daraus den " +
                "Zeitplan (Programmpunkte mit Uhrzeit) und den WP-Plan (Wertungsprüfungen) über " +
                "das Tool extract_event_data. Findest du im Dokument keinen Zeitplan bzw. keinen " +
                "WP-Plan, gib für den jeweiligen Teil ein leeres Array zurück statt zu raten.",
            },
          ],
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      return jsonError(422, "Die PDF konnte nicht verarbeitet werden (vom Modell abgelehnt).");
    }

    const toolUse = message.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "extract_event_data",
    );
    if (!toolUse) {
      return jsonError(
        422,
        "Aus der PDF konnten keine strukturierten Daten extrahiert werden. Ist es wirklich eine Ausschreibung mit Zeitplan/WP-Plan?",
      );
    }

    const result = toolUse.input as { schedule: unknown[]; stages: unknown[] };
    if ((result.schedule?.length ?? 0) === 0 && (result.stages?.length ?? 0) === 0) {
      return jsonError(422, "In der PDF wurden weder Zeitplan- noch WP-Plan-Einträge gefunden.");
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-event-pdf failed:", e);
    if (e instanceof Anthropic.RateLimitError) {
      return jsonError(
        429,
        "Der Extraktionsdienst ist gerade ausgelastet. Bitte in Kürze erneut versuchen.",
      );
    }
    if (e instanceof Anthropic.APIError) {
      return jsonError(502, `Fehler beim Verarbeiten der PDF: ${e.message}`);
    }
    return jsonError(500, "Unerwarteter Fehler bei der PDF-Verarbeitung.");
  }
});
