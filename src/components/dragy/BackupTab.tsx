import { useRef, useState } from "react";
import { Section, Button, Note } from "./ui";
import { useAppStore } from "@/lib/dragy/store";

export function BackupTab() {
  const { state, importBatch, clearAll } = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [log, setLog] = useState("");

  const doExport = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      vehicles: state.vehicles,
      sessions: state.sessions,
      segments: state.segments,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    a.href = url; a.download = `dragy-analyse-${stamp}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importBatch({ vehicles: data.vehicles ?? [], sessions: data.sessions ?? [], segments: data.segments ?? [] });
      setLog(`Importiert: ${(data.vehicles ?? []).length} Fahrzeuge, ${(data.sessions ?? []).length} Sessions, ${(data.segments ?? []).length} Läufe.`);
    } catch (e: any) {
      setLog("Fehler beim Import: " + (e.message ?? e));
    }
  };

  const doClear = async () => {
    const ok = confirm(
      `Wirklich alles löschen?\n\nBetrifft:\n- ${state.vehicles.length} Fahrzeug(e)\n- ${state.sessions.length} Session(s)\n- ${state.segments.length} Lauf/Läufe\n\nDies kann nicht rückgängig gemacht werden.`,
    );
    if (!ok) return;
    await clearAll();
    setLog("Alle Daten gelöscht.");
  };

  return (
    <div>
      <Section title="Backup" note="Mobile Browser können Speicher inaktiver Seiten irgendwann automatisch löschen – regelmäßiger Export empfohlen.">
        <div className="flex flex-wrap gap-2">
          <Button onClick={doExport}>Export als JSON</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>Import aus JSON</Button>
          <Button variant="danger" onClick={doClear}>Alles löschen…</Button>
        </div>
        {log && <p className="mt-2 text-xs text-slate-300">{log}</p>}
        <div className="mt-3 text-xs text-slate-400">
          Bestand: {state.vehicles.length} Fahrzeuge · {state.sessions.length} Sessions · {state.segments.length} Läufe.
        </div>
      </Section>

      <Section title="Hinweise & Grenzen">
        <ul className="list-disc space-y-1 pl-4 text-xs text-slate-300">
          <li>Rotierende Massen (Schwungrad, Getriebe, Räder) werden im Beschleunigungsterm nicht berücksichtigt.</li>
          <li>Antriebsstrangverluste unter Last unterscheiden sich von der Schleppleistung – die Schleppkurve ist eine Näherung.</li>
          <li>RPM ist eine Schätzung aus Geschwindigkeit × Faktor, gilt nur innerhalb eines Ganges ohne Schaltvorgang.</li>
          <li>Auto-Erkennung ist eine Heuristik auf Basis der GPS-Geschwindigkeit; bei Zwischen-Lifts fehleranfällig.</li>
          <li>Drehmoment ist zurückgerechnet aus Leistung/Drehzahl – Fehler im RPM-Faktor wirken sich stärker aus als bei der Leistungskurve.</li>
        </ul>
      </Section>
    </div>
  );
}
