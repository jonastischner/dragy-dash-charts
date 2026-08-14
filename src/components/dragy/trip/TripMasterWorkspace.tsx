import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/dragy/ui";
import {
  acknowledgeWaypoint, addGpsMeters, addManualCorrection, addWaypoint, checkWaypointWarnings,
  createTrip, getAverageSpeed, getCalibratedDistance, getLifetimeDistance, getTimeDeviation,
  removeWaypoint, resetTrip, restartTripOrigin, setCalibrationFactor, setTarget, setWarningDistance,
  startTrip, stopTrip, targetTimeFromSpeed, tickElapsed,
} from "@/services/tripEngine";
import type { RallyeMode, Trip } from "@/types/trip";
import { BestzeitDisplay } from "./BestzeitDisplay";
import { DurchschnittDisplay } from "./DurchschnittDisplay";
import { TripControlBar } from "./TripControlBar";
import { TripSetupPanel } from "./TripSetupPanel";
import { NewTripDialog } from "./NewTripDialog";
import { CalibrationDialog } from "./CalibrationDialog";
import { TargetDialog } from "./TargetDialog";
import { WaypointDialog } from "./WaypointDialog";

const STORAGE_KEY = "dragy.tripmaster.v1";

function loadTrips(): Trip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Trip[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((t) => ({
          ...t,
          isRunning: false,
          totalRawGpsMeters: t.totalRawGpsMeters ?? t.rawGpsMeters,
          totalElapsedSeconds: t.totalElapsedSeconds ?? t.elapsedSeconds,
        }));
      }
    }
  } catch { /* ignore */ }
  return [
    { ...createTrip("bestzeit", 10000, "Trip A") },
    { ...createTrip("durchschnitt", 10000, "Trip B") },
  ];
}

export function TripMasterWorkspace({ onBack }: { onBack: () => void }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [simOn, setSimOn] = useState(false);
  const [simSpeed, setSimSpeed] = useState(10); // Meter pro Sekunde (Simulation)
  const [dialog, setDialog] = useState<null | "new-bestzeit" | "new-durchschnitt" | "calib" | "target" | "waypoint">(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [setupOpen, setSetupOpen] = useState(false);
  const [undo, setUndo] = useState<{ tripId: string; snapshot: Trip } | null>(null);

  useEffect(() => {
    const t = loadTrips();
    setTrips(t);
    setActiveId(t[0]?.id ?? null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trips)); } catch { /* ignore */ }
  }, [trips, loaded]);

  useEffect(() => {
    if (!undo) return;
    const id = window.setTimeout(() => setUndo(null), 5000);
    return () => window.clearTimeout(id);
  }, [undo]);

  const trip = trips.find((t) => t.id === activeId) ?? trips[0] ?? null;

  const update = useCallback((fn: (t: Trip) => Trip) => {
    setTrips((prev) => prev.map((t) => (t.id === (activeId ?? prev[0]?.id) ? fn(t) : t)));
  }, [activeId]);

  // Stoppuhr – läuft, solange der Trip läuft.
  useEffect(() => {
    if (!trip?.isRunning) return;
    const id = window.setInterval(() => {
      update((t) => tickElapsed(t));
    }, 1000);
    return () => window.clearInterval(id);
  }, [trip?.isRunning, update]);

  // GPS-Simulation: fügt alle 100 ms Meter hinzu.
  // TODO: durch echte GPS-Updates ersetzen (expo-location)
  useEffect(() => {
    if (!trip?.isRunning || !simOn) return;
    const id = window.setInterval(() => {
      update((t) => addGpsMeters(t, simSpeed / 10));
    }, 100);
    return () => window.clearInterval(id);
  }, [trip?.isRunning, simOn, simSpeed, update]);

  useEffect(() => { if (!trip?.isRunning) setSimOn(false); }, [trip?.isRunning]);

  if (!trip) return null;

  const distance = getCalibratedDistance(trip);
  const lifetimeDistance = getLifetimeDistance(trip);
  const avg = getAverageSpeed(trip);
  const targetTime = trip.targetTimeSeconds ?? targetTimeFromSpeed(trip);
  const deviation = getTimeDeviation(trip);
  const targetAvg = trip.targetSpeed ?? (targetTime && trip.totalDistance ? (trip.totalDistance / 1000) / (targetTime / 3600) : 0);
  const progress = trip.totalDistance > 0 ? Math.min(1, distance / trip.totalDistance) : 0;
  const liveSpeedKmh = trip.isRunning && simOn ? simSpeed * 3.6 : 0;
  const nextWaypoint = trip.waypoints
    .filter((w) => !w.timestamp && w.distance >= lifetimeDistance)
    .sort((a, b) => a.distance - b.distance)[0] ?? null;
  const warnings = checkWaypointWarnings(trip).filter((w) => !dismissed.includes(w.id));
  const warn = warnings[0];

  const handleReset = () => {
    setUndo({ tripId: trip.id, snapshot: trip });
    update(resetTrip);
    setDismissed([]);
  };
  const handleRewind = () => {
    setUndo({ tripId: trip.id, snapshot: trip });
    update(restartTripOrigin);
  };
  const handleUndo = () => {
    if (!undo) return;
    setTrips((prev) => prev.map((t) => (t.id === undo.tripId ? undo.snapshot : t)));
    setUndo(null);
  };

  return (
    <div className="pb-4">
      <div className="mb-4 flex items-start gap-3">
        <button
          onClick={onBack}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
          aria-label="Zurück zur Übersicht"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-body font-semibold text-foreground">Trip-Master</h2>
          <p className="text-caption text-muted-foreground">Distanz und Soll-Ist-Vergleich für Etappen – ohne Fahrzeugbindung.</p>
        </div>
      </div>

      {/* Trip-Auswahl, nach Modus gruppiert */}
      <div className="flex flex-col gap-3">
        <div role="tablist" aria-label="Trips">
          {(["bestzeit", "durchschnitt"] as const).map((m) => {
            const group = trips.filter((t) => t.mode === m);
            if (group.length === 0) return null;
            return (
              <div key={m} className="mb-2">
                <div className="mb-1 text-caption text-muted-foreground">
                  {m === "bestzeit" ? "Bestzeit-Etappen" : "Gleichmäßigkeits-Etappen"}
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.map((t) => (
                    <button
                      key={t.id}
                      role="tab"
                      aria-selected={t.id === trip.id}
                      onClick={() => { setActiveId(t.id); setDismissed([]); setUndo(null); }}
                      className={`min-h-[48px] rounded-md border px-4 text-caption font-medium transition-ui ${
                        t.id === trip.id ? "border-rally bg-rally/15 text-rally" : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setDialog("new-bestzeit")} className="min-h-[48px]">
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Bestzeit-Etappe
          </Button>
          <Button variant="secondary" onClick={() => setDialog("new-durchschnitt")} className="min-h-[48px]">
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Gleichmäßigkeits-Etappe
          </Button>
        </div>
      </div>

      {undo && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-border bg-elevated px-3 py-2 text-caption text-foreground">
          <span>Zurückgesetzt.</span>
          <Button variant="ghost" onClick={handleUndo}>Rückgängig</Button>
        </div>
      )}

      {/* Hauptanzeige */}
      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        {trip.mode === "bestzeit" ? (
          <BestzeitDisplay
            resetDistance={distance}
            lifetimeDistance={lifetimeDistance}
            resetElapsedSeconds={trip.elapsedSeconds}
            totalElapsedSeconds={trip.totalElapsedSeconds}
            liveSpeedKmh={liveSpeedKmh}
            nextWaypoint={nextWaypoint}
            onReset={handleReset}
          />
        ) : (
          <DurchschnittDisplay
            elapsedSeconds={trip.elapsedSeconds}
            resetDistance={distance}
            lifetimeDistance={lifetimeDistance}
            totalElapsedSeconds={trip.totalElapsedSeconds}
            avg={avg}
            targetAvg={targetAvg}
            targetTime={targetTime}
            deviation={deviation}
            progress={progress}
            nextWaypoint={nextWaypoint}
            onReset={handleReset}
          />
        )}
      </div>

      <TripControlBar
        running={trip.isRunning}
        onToggleRun={() => update(trip.isRunning ? stopTrip : startTrip)}
        onRewind={handleRewind}
        onCorrect={(d) => update((t) => addManualCorrection(t, d))}
        setupOpen={setupOpen}
        onToggleSetup={() => setSetupOpen((o) => !o)}
      />

      {setupOpen && (
        <TripSetupPanel
          trip={trip}
          onCalibrate={() => setDialog("calib")}
          onAddWaypoint={() => setDialog("waypoint")}
          onEditTarget={() => setDialog("target")}
          onRemoveWaypoint={(id) => update((t) => removeWaypoint(t, id))}
          onWarningDistanceChange={(m) => setTrips((prev) => prev.map((t) => setWarningDistance(t, m)))}
          onImportWaypoints={(rows) => {
            // Roadbook-Distanzen sind stage-lokal (ab 0) – auf die stabile
            // Gesamtdistanz umrechnen, einmalig pro Import erfasst.
            const baseline = lifetimeDistance;
            update((t) => rows.reduce((acc, r) => addWaypoint(acc, r.distance + baseline, r.name, r.note), t));
          }}
          simOn={simOn}
          simSpeed={simSpeed}
          onToggleSim={() => setSimOn((s) => !s)}
          onSimSpeedChange={setSimSpeed}
        />
      )}

      {/* Warnungs-Overlay */}
      {warn && (
        <button
          type="button"
          onClick={() => { setDismissed((d) => [...d, warn.id]); update((t) => acknowledgeWaypoint(t, warn.id)); }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6 text-left"
          aria-label="Warnung bestätigen"
        >
          <div className="w-full max-w-sm rounded-2xl border-2 border-rally bg-card/95 p-6 text-center shadow-e3">
            <AlertTriangle className="mx-auto h-10 w-10 text-rally" strokeWidth={2} aria-hidden="true" />
            <div className="mt-3 text-4xl font-semibold tabular-nums text-rally">
              {Math.max(0, Math.round(warn.distance - lifetimeDistance))} m
            </div>
            <div className="mt-2 text-subtitle text-foreground">{warn.name || "Wegpunkt"}</div>
            {warn.note && <p className="mt-1 text-caption text-muted-foreground">{warn.note}</p>}
            <p className="mt-4 text-caption text-muted-foreground">Zum Bestätigen tippen</p>
          </div>
        </button>
      )}

      {(dialog === "new-bestzeit" || dialog === "new-durchschnitt") && (
        <NewTripDialog
          mode={dialog === "new-bestzeit" ? "bestzeit" : "durchschnitt"}
          onClose={() => setDialog(null)}
          onCreate={(name, total, targetTimeSeconds, targetSpeed) => {
            const mode: RallyeMode = dialog === "new-bestzeit" ? "bestzeit" : "durchschnitt";
            const created = setTarget(createTrip(mode, total, name), { targetTimeSeconds, targetSpeed });
            const t: Trip = { ...created, warningDistance: trip.warningDistance };
            setTrips((prev) => [...prev, t]);
            setActiveId(t.id);
            setDialog(null);
          }}
        />
      )}

      {dialog === "calib" && <CalibrationDialog trip={trip} onClose={() => setDialog(null)} onApply={(m) => { update((t) => setCalibrationFactor(t, m)); setDialog(null); }} />}

      {dialog === "target" && <TargetDialog trip={trip} onClose={() => setDialog(null)} onApply={(target) => { update((t) => setTarget(t, target)); setDialog(null); }} />}

      {dialog === "waypoint" && (
        <WaypointDialog
          defaultDistance={Math.round(lifetimeDistance)}
          onClose={() => setDialog(null)}
          onAdd={(d, n, note) => { update((t) => addWaypoint(t, d, n, note)); setDialog(null); }}
        />
      )}
    </div>
  );
}
