// Share Target – später durch native Intent ersetzbar.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Section, Button, Note } from "@/components/dragy/ui";
import { useAppStore } from "@/lib/dragy/store";
import { parseUbx } from "@/lib/dragy/ubx";
import { parseTableFile } from "@/lib/dragy/tabular";
import { nameImportedSession } from "@/lib/dragy/sessionTime";
import { uid } from "@/lib/dragy/db";
import type { Session, Record as R, ModuleId } from "@/lib/dragy/types";

const SHARE_CACHE = "dragy-share-target-v1";
const SHARE_KEY = "/__shared-dragy-file";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "Lauf importieren – Dragy Leistungsanalyse" },
      { name: "description", content: "Geteilte Dragy-Rohdaten (.data/.ubx/CSV) direkt aus dem Share-Sheet in die Leistungsanalyse importieren." },
      { property: "og:title", content: "Lauf importieren – Dragy Leistungsanalyse" },
      { property: "og:description", content: "Geteilte Dragy-Rohdaten direkt aus dem Share-Sheet in die Leistungsanalyse importieren." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ImportPage,
});

type Status = "idle" | "loading" | "ok" | "error";

function ImportPage() {
  const navigate = useNavigate();
  const { state, ready, saveSession } = useAppStore();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("Geteilte Datei wird gelesen…");
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;

    // Share Target – später durch native Intent ersetzbar.
    (async () => {
      setStatus("loading");
      try {
        const vehicle = state.vehicles.find((v) => v.id === state.activeVehicleId);
        if (!vehicle) {
          setStatus("error");
          setMessage("Kein aktives Fahrzeug gewählt. Bitte zuerst in der Garage ein Fahrzeug anlegen bzw. aktivieren.");
          return;
        }

        if (typeof caches === "undefined") {
          setStatus("error");
          setMessage("Dieses Gerät unterstützt den Datei-Import über das Share-Sheet nicht.");
          return;
        }

        const cache = await caches.open(SHARE_CACHE);
        const res = await cache.match(SHARE_KEY);
        if (!res) {
          setStatus("error");
          setMessage("Keine geteilte Datei gefunden. Teile eine Dragy-Datei erneut über das Teilen-Menü an diese App.");
          return;
        }

        const name = decodeURIComponent(res.headers.get("X-Shared-Filename") ?? "shared.data");
        const blob = await res.blob();
        await cache.delete(SHARE_KEY);

        const module: ModuleId = (localStorage.getItem("dragy.activeModule")?.replace(/"/g, "") as ModuleId) || "power";
        const isTable = /\.(csv|txt|tsv|xlsx|xlsm|xls)$/i.test(name);

        // Bestehende Parse-Logik weiterverwenden (kein neuer Parser).
        let records: R[];
        let info = "";
        // Tabellen-Exporte tragen keine absolute Zeit – dort greift der Dateiname.
        let startedAt: number | null = null;
        if (isTable) {
          const parsed = await parseTableFile(new File([blob], name));
          records = parsed.records;
          info = ` – ${parsed.info}`;
        } else {
          const parsed = parseUbx(await blob.arrayBuffer());
          records = parsed.records;
          startedAt = parsed.startedAt;
        }
        if (records.length < 3) throw new Error("Zu wenige gültige Datensätze in der Datei");

        const { recordedAt, name: sessionName } = nameImportedSession(name, startedAt);
        const session: Session = {
          id: uid(),
          vehicleId: vehicle.id,
          name: sessionName,
          records,
          // Keine Vorgabewerte: nicht gepflegte Umgebungsdaten bleiben leer,
          // damit daraus keine Normkorrektur abgeleitet wird.
          manual: false,
          createdAt: Date.now(),
          ...(recordedAt != null ? { recordedAt } : {}),
          module,
        };
        await saveSession(session);

        setStatus("ok");
        setMessage(`${records.length} Punkte importiert als „${sessionName}"${info}`);
        setTimeout(() => navigate({ to: "/" }), 1400);
      } catch (e: any) {
        setStatus("error");
        setMessage(`Import fehlgeschlagen – ${e?.message ?? e}`);
      }
    })();
  }, [ready, state.vehicles, state.activeVehicleId, saveSession, navigate]);

  return (
    <div className="min-h-dvh bg-background px-4 py-10 text-foreground" style={{ paddingTop: "calc(env(safe-area-inset-top) + 2.5rem)" }}>
      <div className="mx-auto max-w-md">
        <h1 className="mb-4 text-subtitle text-foreground">Lauf importieren</h1>
        <Section title="Geteilte Datei">
          <div className="flex items-start gap-3">
            {status === "loading" && <Loader2 className="mt-0.5 h-5 w-5 flex-none animate-spin text-primary" aria-hidden="true" />}
            {status === "ok" && <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-primary" aria-hidden="true" />}
            {status === "error" && <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-destructive" aria-hidden="true" />}
            <p className={`text-caption ${status === "error" ? "text-destructive" : "text-muted-foreground"}`} role="status" aria-live="polite">
              {message}
            </p>
          </div>
          {status === "ok" && <Note>Weiterleitung zur Analyse…</Note>}
          <div className="mt-4">
            <Button variant="secondary" onClick={() => navigate({ to: "/" })}>Zur App</Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
