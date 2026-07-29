import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Car, Upload, ListChecks, Ruler, BarChart3, Database, UserCircle2 } from "lucide-react";
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
const TABS: Array<{ id: Tab; label: string; icon: typeof Car }> = [
  { id: "vehicles", label: "Fahrzeuge", icon: Car },
  { id: "import", label: "Import", icon: Upload },
  { id: "sessions", label: "Sessions", icon: ListChecks },
  { id: "calibration", label: "Kalibrierung", icon: Ruler },
  { id: "compare", label: "Vergleich", icon: BarChart3 },
  { id: "backup", label: "Backup", icon: Database },
  { id: "account", label: "Konto", icon: UserCircle2 },
];

function Index() {
  const [tab, setTab] = useState<Tab>("vehicles");
  const goVehicles = () => setTab("vehicles");

  return (
    <div
      className="min-h-dvh bg-background text-foreground"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-2xl px-3 pt-3 pb-1">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-primary">
              <BarChart3 className="h-4 w-4" />
            </div>
            <h1 className="text-base font-semibold tracking-tight">Dragy Leistungsanalyse</h1>
          </div>
        </div>
        <div className="relative">
          <nav
            aria-label="Bereiche"
            role="tablist"
            className="mx-auto flex max-w-2xl gap-1 overflow-x-auto px-3 pb-2 pt-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {t.label}
                </button>
              );
            })}
          </nav>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background/95 to-transparent" />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-3 py-4">
        {tab === "vehicles" && <VehiclesTab />}
        {tab === "import" && <ImportTab onOpenVehicles={goVehicles} />}
        {tab === "sessions" && <SessionsTab onOpenVehicles={goVehicles} />}
        {tab === "calibration" && <CalibrationTab onOpenVehicles={goVehicles} />}
        {tab === "compare" && <CompareTab onOpenVehicles={goVehicles} />}
        {tab === "backup" && <BackupTab />}
        {tab === "account" && <AccountTab />}
      </main>
    </div>
  );
}
