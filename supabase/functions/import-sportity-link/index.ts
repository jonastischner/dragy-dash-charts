// Teil 3 (Veranstaltungen): Sportity-Link als Komfort-Import.
// Versucht, von einer Sportity-Veranstaltungsseite automatisch die
// Ausschreibungs-PDF zu finden und herunterzuladen, legt sie im selben
// Storage-Bucket wie ein manueller Upload ab und gibt den Storage-Pfad
// zurück – die eigentliche Extraktion läuft danach unverändert über die
// bestehende extract-event-pdf-Funktion (dieselbe Pipeline wie Teil 2).
//
// Sportity-Seiten können sich strukturell unterscheiden und den PDF-Link
// ggf. erst per JavaScript nachladen, das dieser serverseitige Fetch nicht
// ausführt – die automatische Suche kann also fehlschlagen. Das Frontend
// bietet dafür immer den manuellen PDF-Upload als Fallback an; hier wird
// bei jedem Fehlschlag eine konkrete Meldung zurückgegeben statt eines
// stillen Fehlers.

import { createClient } from "npm:@supabase/supabase-js@2.110.8";

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

const MAX_PDF_BYTES = 20 * 1024 * 1024;

function findPdfCandidates(html: string, baseUrl: string): { url: string; score: number }[] {
  const candidates: { url: string; score: number }[] = [];
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, " ");
    if (!/\.pdf(\?|#|$)/i.test(href)) continue;
    let resolved: string;
    try {
      resolved = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    const haystack = `${href} ${text}`.toLowerCase();
    const score = /ausschreibung|programmheft|programm|reglement/.test(haystack) ? 2 : 1;
    candidates.push({ url: resolved, score });
  }
  // Fallback: rohe .pdf-Links außerhalb von <a>-Tags (z. B. in eingebetteten
  // Skripten/JSON-Props einer Single-Page-App).
  if (candidates.length === 0) {
    const rawRe = /["'(]((?:https?:)?\/\/[^"')\s]+\.pdf(?:\?[^"')\s]*)?)["')]/gi;
    while ((m = rawRe.exec(html))) {
      try {
        candidates.push({ url: new URL(m[1], baseUrl).toString(), score: 0 });
      } catch {
        // ungültige URL überspringen
      }
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError(401, "Bitte einloggen, um einen Sportity-Link zu importieren.");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return jsonError(401, "Bitte einloggen, um einen Sportity-Link zu importieren.");
    }

    let body: { eventId?: unknown; sportityUrl?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonError(400, "Ungültige Anfrage.");
    }
    const { eventId, sportityUrl } = body;
    if (
      !eventId ||
      typeof eventId !== "string" ||
      !sportityUrl ||
      typeof sportityUrl !== "string"
    ) {
      return jsonError(400, "Veranstaltung oder Sportity-Link fehlt.");
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(sportityUrl);
    } catch {
      return jsonError(400, "Das ist kein gültiger Link.");
    }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return jsonError(400, "Nur http(s)-Links werden unterstützt.");
    }

    let pageRes: Response;
    try {
      pageRes = await fetch(parsedUrl.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; DragyEventsBot/1.0)" },
      });
    } catch {
      return jsonError(
        502,
        "Die Sportity-Seite konnte nicht geladen werden. Bitte die PDF stattdessen direkt hochladen.",
      );
    }
    if (!pageRes.ok) {
      return jsonError(
        502,
        `Die Sportity-Seite konnte nicht geladen werden (Status ${pageRes.status}). Bitte die PDF stattdessen direkt hochladen.`,
      );
    }
    const html = await pageRes.text();

    const candidates = findPdfCandidates(html, parsedUrl.toString());
    if (candidates.length === 0) {
      return jsonError(
        422,
        "Auf der Sportity-Seite wurde keine Ausschreibung als PDF gefunden. Bitte die PDF stattdessen direkt hochladen.",
      );
    }

    let pdfBytes: Uint8Array | null = null;
    let lastError = "unbekannter Fehler";
    for (const candidate of candidates) {
      try {
        const pdfRes = await fetch(candidate.url);
        if (!pdfRes.ok) {
          lastError = `Status ${pdfRes.status}`;
          continue;
        }
        const buf = new Uint8Array(await pdfRes.arrayBuffer());
        if (buf.byteLength > MAX_PDF_BYTES) {
          lastError = "Datei zu groß";
          continue;
        }
        const magic = new TextDecoder().decode(buf.slice(0, 5));
        if (!magic.startsWith("%PDF-")) {
          lastError = "Keine gültige PDF-Datei";
          continue;
        }
        pdfBytes = buf;
        break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }

    if (!pdfBytes) {
      return jsonError(
        422,
        `Auf der Sportity-Seite wurde ein PDF-Link gefunden, er konnte aber nicht heruntergeladen werden (${lastError}). Bitte die PDF stattdessen direkt hochladen.`,
      );
    }

    const path = `${userData.user.id}/${eventId}/sportity-${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("event-ausschreibungen")
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) {
      return jsonError(500, "Die heruntergeladene PDF konnte nicht gespeichert werden.");
    }

    const { error: updateError } = await supabase
      .from("events")
      .update({
        quelle_typ: "sportity_link",
        quelle_referenz: sportityUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId);
    if (updateError) {
      // Nicht fatal für den Import selbst – die PDF liegt bereits im Storage
      // und kann trotzdem extrahiert werden.
      console.error("Konnte quelle_typ/quelle_referenz nicht aktualisieren:", updateError);
    }

    return new Response(JSON.stringify({ storagePath: path }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-sportity-link failed:", e);
    return jsonError(500, "Unerwarteter Fehler beim Sportity-Import.");
  }
});
