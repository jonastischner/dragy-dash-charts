import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { VehiclesTab } from "@/components/dragy/VehiclesTab";
import { ImportTab } from "@/components/dragy/ImportTab";
import { SessionsTab } from "@/components/dragy/SessionsTab";
import { CalibrationTab } from "@/components/dragy/CalibrationTab";
import { CompareTab } from "@/components/dragy/CompareTab";
import { BackupTab } from "@/components/dragy/BackupTab";
import { AccountTab } from "@/components/dragy/AccountTab";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dragy Leistungs- & Drehmomentanalyse" },
      { name: "description", content: "Client-seitige Analyse von Dragy-GPS-Rohdaten – Leistungs- und Drehmomentkurven mehrerer Fahrzeuge und Läufe vergleichen." },
      { property: "og:title", content: "Dragy Leistungs- & Drehmomentanalyse" },
      { property: "og:description", content: "Client-seitige Analyse von Dragy-GPS-Rohdaten – Leistungs- und Drehmomentkurven mehrerer Fahrzeuge und Läufe vergleichen." },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: Index,
});

type Tab = "vehicles" | "import" | "sessions" | "calibration" | "compare" | "backup" | "account";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "vehicles", label: "Fahrzeuge" },
  { id: "import", label: "Import" },
  { id: "sessions", label: "Sessions" },
  { id: "calibration", label: "Kalibrierung" },
  { id: "compare", label: "Vergleich" },
  { id: "backup", label: "Backup" },
  { id: "account", label: "Konto" },
];

function Index() {
  const [tab, setTab] = useState<Tab>("vehicles");

  return (
    <div
      className="min-h-screen text-foreground"
      style={{
        backgroundColor: "#020617",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-3 py-2">
          <h1 className="text-base font-semibold">Dragy Leistungsanalyse</h1>
          <nav className="mt-2 -mx-1 flex gap-1 overflow-x-auto pb-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium ${tab === t.id ? "bg-primary text-white" : "bg-muted text-foreground"}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-3 py-3">
        {tab === "vehicles" && <VehiclesTab />}
        {tab === "import" && <ImportTab />}
        {tab === "sessions" && <SessionsTab />}
        {tab === "calibration" && <CalibrationTab />}
        {tab === "compare" && <CompareTab />}
        {tab === "backup" && <BackupTab />}
        {tab === "account" && <AccountTab />}
      </main>
    </div>
  );
}
