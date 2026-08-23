import { useMemo } from "react";
import { Gauge, Timer, Mountain, Flag, ChevronRight, Settings2, Compass, CalendarDays, Layers } from "lucide-react";
import { Section, EmptyState, Note } from "./ui";
import { useAppStore } from "@/lib/dragy/store";
import { segmentSamples, splitTime, runDistance, W_TO_PS } from "@/lib/dragy/physics";
import type { ModuleId } from "@/lib/dragy/types";
import { MODULE_DESC, MODULE_IDS, MODULE_LABEL, MODULE_METRIC, sessionModule } from "@/lib/dragy/modules";
import { segmentAlpha, segmentCorrected, sessionCorrection, useCorrectionStandard } from "./useCorrection";

const MODULE_ICON: Record<ModuleId, typeof Gauge> = {
  power: Gauge,
  accel: Timer,
  rally: Mountain,
  circuit: Flag,
};

export function HomeTab({ onOpenModule, onOpenSim, onOpenTrip, onOpenEvents, onOpenGarageCompare, onOpenGarage }: {
  onOpenModule: (m: ModuleId) => void;
  onOpenSim: () => void;
  onOpenTrip: () => void;
  onOpenEvents: () => void;
  onOpenGarageCompare: () => void;
  onOpenGarage: () => void;
}) {
  const { state } = useAppStore();
  const vehicle = state.vehicles.find((v) => v.id === state.activeVehicleId);
  const [standard] = useCorrectionStandard();

  const stats = useMemo(() => {
    const out = {} as Record<ModuleId, { sessions: number; runs: number; best: string }>;
    for (const m of MODULE_IDS) out[m] = { sessions: 0, runs: 0, best: "—" };
    if (!vehicle) return out;

    for (const m of MODULE_IDS) {
      const sessions = state.sessions.filter((s) => s.vehicleId === vehicle.id && sessionModule(s) === m);
      const segs = sessions.flatMap((s) => state.segments.filter((g) => g.sessionId === s.id).map((g) => ({ s, g })));
      let best = "—";
      if (m === "power") {
        let ps = NaN;
        // Der Zusatz „korr." darf nur stehen, wenn der Bestwert tatsächlich aus
        // einem korrigierten Lauf stammt – ohne Umgebungsdaten bleibt alpha = 1.
        let bestApplied = false;
        for (const { s, g } of segs) {
          // Faktor je Session – normiert Läufe bei unterschiedlichem Wetter auf
          // gemeinsame Bedingungen, damit die Bestmarke vergleichbar ist.
          const corr = sessionCorrection(standard, s);
          const alpha = segmentAlpha(g, corr);
          const applied = segmentCorrected(g, corr);
          for (const smp of segmentSamples(s, g, vehicle)) {
            const p = smp.pEngineW * W_TO_PS * alpha;
            if (Number.isFinite(p) && (!Number.isFinite(ps) || p > ps)) { ps = p; bestApplied = applied; }
          }
        }
        if (Number.isFinite(ps)) best = `${ps.toFixed(0)} PS${bestApplied ? " korr." : ""}`;
      } else if (m === "accel") {
        let t: number | null = null;
        for (const { s, g } of segs) {
          const v = splitTime(s.records, g.startT, g.endT, 0, 100);
          if (v != null && (t == null || v < t)) t = v;
        }
        if (t != null) best = `${t.toFixed(2)} s`;
      } else {
        let t: number | null = null;
        for (const { s, g } of segs) {
          const rec = s.records.filter((r) => r.t >= g.startT && r.t <= g.endT);
          if (rec.length < 2) continue;
          const d = rec[rec.length - 1].t - rec[0].t;
          if (runDistance(s.records, g.startT, g.endT) > 0 && (t == null || d < t)) t = d;
        }
        if (t != null) best = `${t.toFixed(2)} s`;
      }
      out[m] = { sessions: sessions.length, runs: segs.length, best };
    }
    return out;
  }, [state, vehicle, standard]);

  return (
    <>
      {!vehicle ? (
        <Section title="Start">
          <EmptyState
            title="Kein Fahrzeug ausgewählt"
            description="Fahrzeuge gelten über alle Module hinweg. Lege zuerst ein Fahrzeug an und wähle es oben aus."
            actionLabel="Zur Garage"
            onAction={onOpenGarage}
          />
        </Section>
      ) : (
        <Section title={`Module – ${vehicle.name}`}>
          <Note>Jedes Modul hat eigene Sessions, Läufe und Auswertungen. Das Fahrzeug bleibt über alle Module hinweg aktiv.</Note>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {MODULE_IDS.map((m) => {
              const Icon = MODULE_ICON[m];
              const st = stats[m];
              return (
                <li key={m}>
                  <button
                    onClick={() => onOpenModule(m)}
                    className="flex w-full items-start gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-ring"
                  >
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-md bg-secondary text-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-body font-semibold text-foreground">{MODULE_LABEL[m]}</span>
                        <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                      </span>
                      <span className="mt-1 block text-caption text-muted-foreground">{MODULE_DESC[m]}</span>
                      <span className="mt-2 block text-caption text-foreground">
                        <b className="tabular-nums">{st.best}</b>
                        <span className="text-muted-foreground"> {MODULE_METRIC[m]} · {st.sessions} Sessions · {st.runs} Läufe</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            <li className="sm:col-span-2">
              <button
                onClick={onOpenSim}
                className="flex w-full items-start gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-ring"
              >
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-md bg-secondary text-foreground">
                  <Settings2 className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-body font-semibold text-foreground">Getriebe-Simulator</span>
                    <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                  </span>
                  <span className="mt-1 block text-caption text-muted-foreground">Setups vergleichen, ohne das Fahrzeug zu ändern</span>
                </span>
              </button>
            </li>
          </ul>
        </Section>
      )}

      <Section title="Weitere Werkzeuge">
        <ul className="grid gap-2 sm:grid-cols-2">
          <li className="sm:col-span-2">
            <button
              onClick={onOpenTrip}
              className="flex w-full items-start gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-ring"
            >
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-md bg-secondary text-foreground">
                <Compass className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-body font-semibold text-foreground">Trip-Master</span>
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                </span>
                <span className="mt-1 block text-caption text-muted-foreground">Distanzmessung und Soll-Ist-Vergleich für Etappen – ohne Fahrzeugbindung.</span>
              </span>
            </button>
          </li>
          <li className="sm:col-span-2">
            <button
              onClick={onOpenEvents}
              className="flex w-full items-start gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-ring"
            >
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-md bg-secondary text-foreground">
                <CalendarDays className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-body font-semibold text-foreground">Veranstaltungen</span>
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                </span>
                <span className="mt-1 block text-caption text-muted-foreground">Rallyes zentral anlegen: Zeitplan und WP-Plan verwalten (Login erforderlich).</span>
              </span>
            </button>
          </li>
          <li className="sm:col-span-2">
            <button
              onClick={onOpenGarageCompare}
              className="flex w-full items-start gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-ring"
            >
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-md bg-secondary text-foreground">
                <Layers className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-body font-semibold text-foreground">Fahrzeugvergleich</span>
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                </span>
                <span className="mt-1 block text-caption text-muted-foreground">Leistungs- und Drehmomentkurven verschiedener Fahrzeuge übereinanderlegen – unabhängig vom aktiven Fahrzeug.</span>
              </span>
            </button>
          </li>
        </ul>
      </Section>
    </>
  );
}
