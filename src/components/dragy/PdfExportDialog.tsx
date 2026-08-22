import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Button, Field, TextInput, Note } from "./ui";
import { exportRunPdf, type PdfHeaderInfo, type RunPdfData } from "@/lib/dragy/mahaPdf";
import { useCorrectionStandard } from "./useCorrection";
import { CorrectionSelect } from "./CorrectionSelect";

function storeKey(vehicleId: string) { return `dragy.pdfHeader.${vehicleId}`; }

/**
 * Dialog für die Kopf-/Fußdaten des Protokolls (Kennzeichen, Prüfer, …).
 * Werte werden je Fahrzeug in localStorage gemerkt.
 */
export function PdfExportDialog({ runs, onClose }: { runs: RunPdfData[]; onClose: () => void }) {
  const vehicleId = runs[0]?.vehicle.id ?? "";
  const [info, setInfo] = useState<PdfHeaderInfo>({});
  const [standard] = useCorrectionStandard();

  useEffect(() => {
    if (!vehicleId) return;
    try {
      const raw = localStorage.getItem(storeKey(vehicleId));
      if (raw) setInfo(JSON.parse(raw));
      else setInfo({ vehicleType: runs[0]?.vehicle.name });
    } catch { /* ignorieren */ }
  }, [vehicleId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const set = (k: keyof PdfHeaderInfo) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setInfo((p) => ({ ...p, [k]: e.target.value }));

  const submit = () => {
    try { localStorage.setItem(storeKey(vehicleId), JSON.stringify(info)); } catch { /* ignorieren */ }
    exportRunPdf(runs, info, standard);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 md:items-center md:p-6" role="dialog" aria-modal="true" aria-label="PDF-Protokoll exportieren">
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-border bg-card p-4 md:rounded-xl"
        style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))", paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <h3 className="mb-1 text-subtitle text-foreground">PDF-Protokoll</h3>
        <p className="mb-3 text-caption text-muted-foreground">
          {runs.length === 1 ? "1 Lauf" : `${runs.length} Läufe`} · A4 quer, Leistung & Drehmoment über Drehzahl
        </p>

        <div className="grid gap-3">
          <Field label="Fahrzeug-Typ"><TextInput value={info.vehicleType ?? ""} onChange={set("vehicleType")} placeholder="z. B. BMW S14" /></Field>
          <Field label="Kennzeichen"><TextInput value={info.plate ?? ""} onChange={set("plate")} placeholder="z. B. MH TT 16" /></Field>
          <Field label="Prüfer"><TextInput value={info.tester ?? ""} onChange={set("tester")} placeholder="Kürzel oder Name" /></Field>
          <Field label="Kunde (optional)"><TextInput value={info.customer ?? ""} onChange={set("customer")} /></Field>
        </div>

        <div className="mt-3">
          <CorrectionSelect label="Normkorrektur im Protokoll" />
        </div>

        <div className="mt-3 space-y-2">
          <Note>
            GPS-Messung statt Rollenprüfstand: Motorwerte sind Schätzungen.
            {standard === "none"
              ? " Das Protokoll weist sie als unkorrigiert aus."
              : " Norm und Korrekturfaktor stehen im Protokoll; Radleistung bleibt Messwert."}
          </Note>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
          <Button onClick={submit}><FileText className="h-4 w-4" aria-hidden="true" />PDF erzeugen</Button>
        </div>
      </div>
    </div>
  );
}
