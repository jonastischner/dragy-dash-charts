import { useMemo } from "react";
import { ArrowLeft, ListChecks, BarChart3, GitCompare } from "lucide-react";
import { usePersistedState, EmptyState, Section } from "../ui";
import { useAppStore } from "@/lib/dragy/store";
import type { ModuleId } from "@/lib/dragy/types";
import { MODULE_DESC, MODULE_LABEL, sessionModule } from "@/lib/dragy/modules";
import { RunsList } from "./RunsList";
import { ModuleAnalysis } from "./ModuleAnalysis";
import { CompareTab } from "../CompareTab";

type View = "runs" | "analysis" | "compare";
const VIEWS: Array<{ id: View; label: string; icon: typeof ListChecks }> = [
  { id: "runs", label: "Läufe", icon: ListChecks },
  { id: "analysis", label: "Auswertung", icon: BarChart3 },
  { id: "compare", label: "Vergleich", icon: GitCompare },
];

export function ModuleWorkspace({ module, onBack, onOpenGarage }: {
  module: ModuleId; onBack: () => void; onOpenGarage?: () => void;
}) {
  const { state } = useAppStore();
  const [view, setView] = usePersistedState<View>(`dragy.module.view.${module}`, "runs");
  const activeVehicle = state.vehicles.find((v) => v.id === state.activeVehicleId);

  const sessions = useMemo(
    () => (activeVehicle
      ? state.sessions.filter((s) => s.vehicleId === activeVehicle.id && sessionModule(s) === module)
      : []),
    [state.sessions, activeVehicle, module],
  );

  return (
    <div>
      <div className="mb-4 flex items-start gap-3">
        <button
          onClick={onBack}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
          aria-label="Zurück zur Übersicht"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-body font-semibold text-foreground">{MODULE_LABEL[module]}</h2>
          <p className="text-caption text-muted-foreground">{MODULE_DESC[module]}</p>
        </div>
      </div>

      <div role="tablist" aria-label="Modul-Ansichten" className="mb-4 flex gap-1 rounded-md border border-border bg-muted p-1">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const active = view === v.id;
          return (
            <button
              key={v.id}
              role="tab"
              aria-selected={active}
              onClick={() => setView(v.id)}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded px-3 text-caption font-medium ${
                active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {v.label}
            </button>
          );
        })}
      </div>

      {!activeVehicle ? (
        <Section title={MODULE_LABEL[module]}>
          <EmptyState title="Kein aktives Fahrzeug" description="Wähle oben ein Fahrzeug oder lege eines in der Garage an." actionLabel="Zur Garage" onAction={onOpenGarage} />
        </Section>
      ) : view === "runs" ? (
        <RunsList module={module} onOpenGarage={onOpenGarage} />
      ) : view === "analysis" ? (
        <ModuleAnalysis module={module} sessions={sessions} segments={state.segments} vehicle={activeVehicle} />
      ) : (
        <CompareTab module={module} onOpenVehicles={onOpenGarage} />
      )}
    </div>
  );
}
