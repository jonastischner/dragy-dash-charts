import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Car, Upload, ListChecks, Ruler, BarChart3, Database, UserCircle2, MoreHorizontal, X, Bluetooth } from "lucide-react";
import { VehiclesTab } from "@/components/dragy/VehiclesTab";
import { ImportTab } from "@/components/dragy/ImportTab";
import { SessionsTab } from "@/components/dragy/SessionsTab";
import { CalibrationTab } from "@/components/dragy/CalibrationTab";
import { CompareTab } from "@/components/dragy/CompareTab";
import { BackupTab } from "@/components/dragy/BackupTab";
import { AccountTab } from "@/components/dragy/AccountTab";
import { LiveTab } from "@/components/dragy/LiveTab";
import { usePersistedState } from "@/components/dragy/ui";
import { SESSION_KIND_LABEL } from "@/lib/dragy/categories";
import type { SessionKind } from "@/lib/dragy/types";


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

type Tab = "vehicles" | "live" | "import" | "sessions" | "calibration" | "compare" | "backup" | "account";
type TabDef = { id: Tab; label: string; icon: typeof Car };

const PRIMARY_TABS: TabDef[] = [
  { id: "vehicles", label: "Fahrzeuge", icon: Car },
  { id: "sessions", label: "Sessions", icon: ListChecks },
  { id: "compare", label: "Vergleich", icon: BarChart3 },
  { id: "import", label: "Import", icon: Upload },
];
const MORE_TABS: TabDef[] = [
  { id: "live", label: "Live (BLE)", icon: Bluetooth },
  { id: "calibration", label: "Kalibrierung", icon: Ruler },
  { id: "backup", label: "Backup", icon: Database },
  { id: "account", label: "Konto", icon: UserCircle2 },
];
const ALL_TABS = [...PRIMARY_TABS, ...MORE_TABS];

function Index() {
  const [tab, setTab] = useState<Tab>("vehicles");
  const [sheetOpen, setSheetOpen] = useState(false);
  const goVehicles = () => setTab("vehicles");
  const active = ALL_TABS.find((t) => t.id === tab)!;
  const moreActive = MORE_TABS.some((t) => t.id === tab);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSheetOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const select = (id: Tab) => { setTab(id); setSheetOpen(false); };

  return (
    <div className="min-h-dvh bg-background text-foreground" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-4 py-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-8 w-8 flex-none place-items-center rounded-md bg-primary/15 text-primary">
              <BarChart3 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </div>
            <h1 className="truncate text-subtitle text-foreground">Dragy Leistungsanalyse</h1>
          </div>
          {/* Desktop: Top-Nav (keine zweite Navigation derselben Ebene) */}
          <nav aria-label="Bereiche" role="tablist" className="ml-auto hidden items-center gap-1 md:flex">
            {ALL_TABS.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex min-h-[44px] items-center gap-2 rounded-md px-3 text-caption font-medium transition-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    isActive
                      ? "bg-primary/15 text-primary shadow-[inset_0_-2px_0_0_var(--color-primary)]"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-6 pb-[calc(80px+env(safe-area-inset-bottom))] md:px-6 md:pb-6">
        <h2 className="sr-only">{active.label}</h2>
        {tab === "vehicles" && <VehiclesTab />}
        {tab === "import" && <ImportTab onOpenVehicles={goVehicles} />}
        {tab === "sessions" && <SessionsTab onOpenVehicles={goVehicles} />}
        {tab === "calibration" && <CalibrationTab onOpenVehicles={goVehicles} />}
        {tab === "compare" && <CompareTab onOpenVehicles={goVehicles} />}
        {tab === "live" && <LiveTab onOpenVehicles={goVehicles} />}
        {tab === "backup" && <BackupTab />}
        {tab === "account" && <AccountTab />}
      </main>

      {/* Mobile: Tab-Bar unten (4 Hauptbereiche + „Mehr"-Sheet) */}
      <nav
        aria-label="Hauptbereiche"
        role="tablist"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-[1200px] items-stretch gap-2 px-4 py-2">
          {PRIMARY_TABS.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(t.id)}
                className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-caption font-medium transition-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive ? "bg-primary/15 text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
                {t.label}
              </button>
            );
          })}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen(true)}
            className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-caption font-medium transition-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              moreActive ? "bg-primary/15 text-primary" : "text-muted-foreground"
            }`}
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={moreActive ? 2.5 : 2} aria-hidden="true" />
            Mehr
          </button>
        </div>
      </nav>

      {sheetOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Weitere Bereiche">
          <button
            type="button"
            aria-label="Menü schließen"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-neutral-0/60 backdrop-blur-sm"
          />
          <div
            className="animate-sheet-in absolute inset-x-0 bottom-0 rounded-t-xl border-t border-border bg-card p-4 shadow-e3"
            style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <span className="text-subtitle text-foreground">Weitere Bereiche</span>
              <button
                type="button"
                aria-label="Schließen"
                onClick={() => setSheetOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-ui hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {MORE_TABS.map((t) => {
                const Icon = t.icon;
                const isActive = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => select(t.id)}
                    className={`flex min-h-[44px] items-center gap-3 rounded-md px-3 text-body font-medium transition-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isActive ? "bg-primary/15 text-primary" : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
