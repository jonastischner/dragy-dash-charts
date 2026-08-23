// Liest ein abfotografiertes oder eingescanntes Leistungsprüfstands-Protokoll
// (MAHA LPS und Ähnliche) und gibt Kopfdaten, Leistungsdaten und die vom
// Diagramm abgelesenen Kurven als strukturiertes JSON zurück.
//
// Es wird bewusst NICHTS gespeichert: das Frontend zeigt die Extraktion erst
// zur Kontrolle und Korrektur an (DynoImportDialog). Die aus dem Diagramm
// abgelesenen Kurvenpunkte sind naturgemäß ungenauer als der gedruckte
// Leistungsdaten-Block – deshalb liefert das Tool beides, und das Frontend
// verankert die Kurve an den gedruckten Eckwerten (siehe dynoExtract.ts).

// Bewusst ungepinnt: Deno löst dies beim Deploy gegen die aktuelle
// npm-"latest"-Version auf – dieselbe Begründung wie in extract-event-pdf.
import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 12 * 1024 * 1024;

const EXTRACT_TOOL = {
  name: "extract_dyno_sheet",
  description:
    "Extrahiert Kopfdaten, Leistungsdaten und die Kurvenverläufe aus dem Protokoll eines " +
    "Leistungsprüfstands (z.B. MAHA LPS3000).",
  input_schema: {
    type: "object" as const,
    properties: {
      bench: { type: "string", description: "Bezeichnung des Prüfstands, z.B. 'MAHA LPS3000 4x4'. Leer, wenn nicht lesbar." },
      operator: { type: "string", description: "Prüfer/Bediener. Leer, wenn nicht angegeben." },
      vehicle: { type: "string", description: "Fahrzeug-Typ laut Protokoll. Leer, wenn nicht angegeben." },
      measuredAt: { type: "string", description: "Meßdatum und -uhrzeit als ISO-8601 (z.B. 2024-11-28T09:36:00). Leer, wenn nicht lesbar." },
      correctedBy: {
        type: "string",
        enum: ["din70020", "ewg80_1269", "none"],
        description: "Korrekturnorm laut Protokoll ('Korrektur nach ...'). 'none', wenn keine genannt ist.",
      },
      printed: {
        type: "object",
        description: "Der GEDRUCKTE Leistungsdaten-Block. Diese Zahlen stehen als Text im Protokoll und sind zuverlässig lesbar – nicht aus dem Diagramm ablesen.",
        properties: {
          psNorm: { type: "number", description: "P_Norm in PS." },
          psEngine: { type: "number", description: "P_Mot in PS." },
          psWheel: { type: "number", description: "P_Rad in PS." },
          psDrag: { type: "number", description: "P_Schlepp in PS." },
          psRpm: { type: "number", description: "Drehzahl der maximalen Leistung in U/min." },
          psKmh: { type: "number", description: "Geschwindigkeit bei maximaler Leistung in km/h." },
          nmNorm: { type: "number", description: "M_Norm in Nm." },
          nmRpm: { type: "number", description: "Drehzahl des maximalen Drehmoments in U/min." },
          nmKmh: { type: "number", description: "Geschwindigkeit beim maximalen Drehmoment in km/h." },
          maxRpm: { type: "number", description: "Maximal erreichte Drehzahl in U/min." },
          maxKmh: { type: "number", description: "Geschwindigkeit bei maximal erreichter Drehzahl in km/h." },
        },
        required: [],
        additionalProperties: false,
      },
      env: {
        type: "object",
        description: "Umgebungsdaten laut Protokoll.",
        properties: {
          tempC: { type: "number", description: "T_Umgebung in °C." },
          pressureHpa: { type: "number", description: "p_Luft in hPa." },
          rh: { type: "number", description: "H_Luft in %." },
        },
        required: [],
        additionalProperties: false,
      },
      curve: {
        type: "array",
        description:
          "Die aus dem DIAGRAMM abgelesenen Kurvenpunkte, auf einem gleichmäßigen Drehzahlraster " +
          "(etwa alle 250 U/min) vom Anfang bis zum Ende der gezeichneten Kurven. Werte an den " +
          "Achsen ablesen; wenn eine Teilkurve an einer Stelle nicht erkennbar ist, das Feld weglassen.",
        items: {
          type: "object",
          properties: {
            rpm: { type: "number", description: "Drehzahl in U/min." },
            pWheelPs: { type: "number", description: "P-Rad an dieser Drehzahl in PS." },
            pDragPs: { type: "number", description: "P-Schlepp an dieser Drehzahl in PS." },
            pEnginePs: { type: "number", description: "P-Norm bzw. P-Motor an dieser Drehzahl in PS." },
          },
          required: ["rpm"],
          additionalProperties: false,
        },
      },
    },
    required: ["curve", "printed", "correctedBy"],
    additionalProperties: false,
  },
  strict: true,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: { fileBase64?: unknown; mediaType?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonError(400, "Ungültige Anfrage.");
    }
    const { fileBase64, mediaType } = body;
    if (typeof fileBase64 !== "string" || !fileBase64) {
      return jsonError(400, "Keine Datei übergeben.");
    }
    if (typeof mediaType !== "string" || (!IMAGE_TYPES.includes(mediaType) && mediaType !== "application/pdf")) {
      return jsonError(400, "Nicht unterstütztes Dateiformat. Erlaubt sind JPEG, PNG, WebP, GIF und PDF.");
    }
    // base64 wächst um rund 4/3 gegenüber den Rohbytes.
    if (fileBase64.length * 0.75 > MAX_BYTES) {
      return jsonError(413, "Die Datei ist zu groß (maximal 12 MB).");
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonError(
        500,
        "Das Auslesen von Prüfstandsprotokollen ist serverseitig nicht konfiguriert (ANTHROPIC_API_KEY fehlt).",
      );
    }
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const source = mediaType === "application/pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: fileBase64 } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType as "image/jpeg", data: fileBase64 } };

    const message = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 8192,
      // Wie in extract-event-pdf: forciertes tool_choice erzwingt die
      // strukturierte Ausgabe, lässt sich aber nicht mit Thinking kombinieren.
      thinking: { type: "disabled" },
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "extract_dyno_sheet" },
      messages: [
        {
          role: "user",
          content: [
            source,
            {
              type: "text",
              text:
                "Das ist das Protokoll einer Leistungsmessung auf einem Rollenprüfstand. " +
                "Extrahiere es über das Tool extract_dyno_sheet.\n\n" +
                "Wichtig für die Genauigkeit:\n" +
                "1. Die Felder unter 'printed' stehen als Text im Protokoll (Block 'Leistungsdaten' " +
                "bzw. 'Umgebungsdaten'). Übernimm sie exakt so, wie sie gedruckt sind – niemals aus " +
                "dem Diagramm schätzen. Deutsche Dezimalkommas als Punkt zurückgeben (296,2 -> 296.2).\n" +
                "2. Die Felder unter 'curve' liest du dagegen aus dem Diagramm ab. Arbeite die " +
                "Drehzahlachse in gleichmäßigen Schritten von etwa 250 U/min ab und lies für jede " +
                "Kurve den Wert an der Leistungsachse ab.\n" +
                "3. Ist ein Wert nicht sicher lesbar, lass das Feld weg, statt zu raten.",
            },
          ],
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      return jsonError(422, "Das Protokoll konnte nicht verarbeitet werden (vom Modell abgelehnt).");
    }

    const toolUse = message.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "extract_dyno_sheet",
    );
    if (!toolUse) {
      return jsonError(422, "Aus der Datei konnten keine Prüfstandsdaten gelesen werden. Ist es wirklich ein Leistungsprotokoll?");
    }

    return new Response(JSON.stringify(toolUse.input), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-dyno-sheet failed:", e);
    if (e instanceof Anthropic.RateLimitError) {
      return jsonError(429, "Der Extraktionsdienst ist gerade ausgelastet. Bitte in Kürze erneut versuchen.");
    }
    if (e instanceof Anthropic.APIError) {
      return jsonError(502, `Fehler beim Auslesen des Protokolls: ${e.message}`);
    }
    return jsonError(500, "Unerwarteter Fehler beim Auslesen des Protokolls.");
  }
});
