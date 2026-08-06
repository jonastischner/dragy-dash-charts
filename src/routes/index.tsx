import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BarChart3, Car, Home, Radio, MoreHorizontal } from "lucide-react";
import { VehiclesTab } from "@/components/dragy/VehiclesTab";
import { HomeTab } from "@/components/dragy/HomeTab";
import { CaptureTab } from "@/components/dragy/CaptureTab";
import { MoreTab } from "@/components/dragy/MoreTab";
import { ModuleWorkspace } from "@/components/dragy/module/ModuleWorkspace";
import { usePersistedState } from "@/components/dragy/ui";
import { useAppStore } from "@/lib/dragy/store";
import type { ModuleId } from "@/lib/dragy/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dragy Leistungs- & Drehmomentanalyse" },
      { name: "description", content: "Client-seitige Analyse von Dragy-GPS-Rohdaten – Leistung, Beschleunigung, Rallye-Stages und Rundstrecken-Runden je Fahrzeug auswerten und vergleichen." },
      { property: "og:title", content: "Dragy Leistungs- & Drehmomentanalyse" },
      { property: "og:description", content: "Client-seitige Analyse von Dragy-GPS-Rohdaten – Leistung, Beschleunigung, Rallye-Stages und Rundstrecken-Runden je Fahrzeug auswerten und vergleichen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: Index,
});

type Tab = "start" | "capture" | "garage" | "more";
const TABS: Array<{ id: Tab; label: string; icon: typeof Home }> = [
  { id: "start", label: "Start", icon: Home },
  { id: "capture", label: "Aufnehmen", icon: Radio },
  { id: "garage", label: "Garage", icon: Car },
  { id: "more", label: "Mehr", icon: MoreHorizontal },
];

function Index() {
  const { state, setActive } = useAppStore();
  const [tab, setTab] = useState<Tab>("start");
  const [module, setModule] = usePersistedState<ModuleId>("dragy.activeModule", "power");
  const [openModule, setOpenModule] = useState<ModuleId | null>(null);

  const goGarage = () => { setOpenModule(null); setTab("garage"); };

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

          {/* Global: Fahrzeugauswahl gilt modulübergreifend */}
          <div className="ml-auto flex items-center gap-2">
            <label className="sr-only" htmlFor="active-vehicle">Aktives Fahrzeug</label>
            <select
              id="active-vehicle"
              value={state.activeVehicleId ?? ""}
              onChange={(e) => setActive(e.target.value || null)}
              className="min-h-11 max-w-[200px] rounded-md border border-input bg-muted px-3 text-caption text-foreground focus:border-ring focus:outline-none"
            >
              <option value="">– Fahrzeug wählen –</option>
              {state.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        </div>

        {/* Desktop-Navigation */}
        <nav aria-label="Bereiche" role="tablist" className="mx-auto hidden max-w-[1200px] items-center gap-1 px-4 pb-3 md:flex md:px-6">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => { setTab(t.id); if (t.id !== "start") setOpenModule(null); }}
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-md px-3 text-caption font-medium transition-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-6 pb-[calc(80px+env(safe-area-inset-bottom))] md:px-6 md:pb-6">
        {tab === "start" && (
          openModule
            ? <ModuleWorkspace module={openModule} onBack={() => setOpenModule(null)} onOpenGarage={goGarage} />
            : <HomeTab onOpenModule={(m) => { setModule(m); setOpenModule(m); }} onOpenGarage={goGarage} />
        )}
        {tab === "capture" && <CaptureTab module={module} onModuleChange={setModule} onOpenGarage={goGarage} />}
        {tab === "garage" && <VehiclesTab />}
        {tab === "more" && <MoreTab />}
      </main>

      {/* Mobile: Tab-Bar unten */}
      <nav
        aria-label="Hauptbereiche"
        role="tablist"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-[1200px] items-stretch gap-2 px-4 py-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => { setTab(t.id); if (t.id !== "start") setOpenModule(null); }}
                className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-caption font-medium transition-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive ? "bg-primary/15 text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
