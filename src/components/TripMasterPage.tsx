import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Gauge, MapPin, Pause, Play, Plus, RotateCcw, Ruler, Settings, Trash2, X,
} from "lucide-react";
import { Button, Field, NumInput, Select, TextInput, TextArea } from "@/components/dragy/ui";
import { TripMasterSettings } from "@/components/TripMasterSettings";
import {
  acknowledgeWaypoint, addGpsMeters, addManualCorrection, addWaypoint, checkWaypointWarnings,
  createTrip, formatClock, formatKm, getAverageSpeed, getCalibratedDistance, getTimeDeviation,
  removeWaypoint, resetTrip, setCalibrationFactor, setWarningDistance, startTrip, stopTrip,
  targetTimeFromSpeed,
} from "@/services/tripEngine";
import type { RallyeMode, Trip, Waypoint } from "@/types/trip";

const STORAGE_KEY = "dragy.tripmaster.v1";

function loadTrips(): Trip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Trip[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.map((t) => ({ ...t, isRunning: false }));
    }
  } catch { /* ignore */ }
  return [
    { ...createTrip("bestzeit", 10000, "Trip A") },
    { ...createTrip("durchschnitt", 10000, "Trip B") },
  ];
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-e3"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mb-3 flex items-center gap-2">
          <h3 className="min-w-0 flex-1 text-subtitle text-foreground">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Schließen" className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground hover:bg-accent">
            <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Metric({ label, value, big = false, tone = "default" }: { label: string; value: string; big?: boolean; tone?: "default" | "accent" | "warn" }) {
  const toneCls = tone === "accent" ? "text-rally" : tone === "warn" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-elevated px-3 py-3">
      <div className="text-caption text-muted-foreground">{label}</div>
      <div className={`mt-1 font-semibold tabular-nums ${big ? "text-4xl sm:text-5xl" : "text-2xl"} ${toneCls}`}>{value}</div>
    </div>
  );
}

export function TripMasterPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [simOn, setSimOn] = useState(false);
  const [simSpeed, setSimSpeed] = useState(10); // Meter pro Sekunde (Simulation)
  const [dialog, setDialog] = useState<null | "new" | "calib" | "waypoint" | "reset" | "settings">(null);
  const [dismissed, setDismissed] = useState<string[]>([]);

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

  const trip = useMemo(() => trips.find((t) => t.id === activeId) ?? trips[0] ?? null, [trips, activeId]);

  const update = useCallback((fn: (t: Trip) => Trip) => {
    setTrips((prev) => prev.map((t) => (t.id === (activeId ?? prev[0]?.id) ? fn(t) : t)));
  }, [activeId]);

  // Stoppuhr – läuft, solange der Trip läuft.
  useEffect(() => {
    if (!trip?.isRunning) return;
    const id = window.setInterval(() => {
      update((t) => ({ ...t, elapsedSeconds: t.elapsedSeconds + 1 }));
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
  const avg = getAverageSpeed(trip);
  const targetTime = trip.targetTimeSeconds ?? targetTimeFromSpeed(trip);
  const deviation = getTimeDeviation(trip);
  const targetAvg = trip.targetSpeed ?? (targetTime && trip.totalDistance ? (trip.totalDistance / 1000) / (targetTime / 3600) : 0);
  const warnings = checkWaypointWarnings(trip).filter((w) => !dismissed.includes(w.id));
  const warn = warnings[0];
  const progress = trip.totalDistance > 0 ? Math.min(1, distance / trip.totalDistance) : 0;

  return (
    <div className="pb-4">
      {/* Trip-Auswahl */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Trips" className="flex min-w-0 flex-1 flex-wrap gap-2">
          {trips.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === trip.id}
              onClick={() => { setActiveId(t.id); setDismissed([]); }}
              className={`min-h-[48px] rounded-md border px-4 text-caption font-medium transition-ui ${
                t.id === trip.id ? "border-rally bg-rally/15 text-rally" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {t.name}
              <span className="ml-2 text-muted-foreground">{t.mode === "bestzeit" ? "Bestzeit" : "Ø"}</span>
            </button>
          ))}
        </div>
        <Button variant="secondary" onClick={() => setDialog("settings")} className="min-h-[48px]">
          <Settings className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Einstellungen
        </Button>
        <Button onClick={() => setDialog("new")} className="min-h-[48px]">
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Neuen Trip erstellen
        </Button>
      </div>

      {/* Hauptanzeige */}
      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        {trip.mode === "bestzeit" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3"><Metric label="Stoppuhr" value={formatClock(trip.elapsedSeconds)} big tone="accent" /></div>
            <Metric label="Gefahrene Distanz" value={formatKm(distance)} />
            <Metric label="Ø-Geschwindigkeit" value={`${avg.toFixed(1)} km/h`} />
            <Metric label="Restdistanz" value={formatKm(Math.max(0, trip.totalDistance - distance))} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Metric
                label="Abweichung (+ zu früh / − zu spät)"
                value={`${deviation >= 0 ? "+" : "−"}${formatClock(Math.abs(deviation))}`}
                big
                tone={Math.abs(deviation) > 10 ? "warn" : "accent"}
              />
            </div>
            <Metric label="Kalibrierte Distanz" value={formatKm(distance)} />
            <Metric label="Soll-Ø" value={`${(targetAvg || 0).toFixed(1)} km/h`} />
            <Metric label="Ist-Ø" value={`${avg.toFixed(1)} km/h`} />
            <div className="sm:col-span-3">
              <div className="mb-1 flex justify-between text-caption text-muted-foreground">
                <span>Soll-Ist-Verlauf</span>
                <span>{(progress * 100).toFixed(0)} %</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-elevated">
                <div className="h-full bg-rally transition-ui" style={{ width: `${progress * 100}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-caption text-muted-foreground">
                <span>Sollzeit: {targetTime ? formatClock(targetTime) : "–"}</span>
                <span>Laufzeit: {formatClock(trip.elapsedSeconds)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 text-caption text-muted-foreground sm:grid-cols-4">
          <div>Roh-GPS: <span className="text-foreground">{formatKm(trip.rawGpsMeters)}</span></div>
          <div>Faktor: <span className="text-foreground">{trip.calibrationFactor.toFixed(4)}</span></div>
          <div>Offset: <span className="text-foreground">{trip.manualOffset.toFixed(0)} m</span></div>
          <div>Gesamtstrecke: <span className="text-foreground">{formatKm(trip.totalDistance)}</span></div>
        </div>
      </div>

      {/* Steuerung */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {trip.isRunning ? (
          <Button variant="secondary" onClick={() => update(stopTrip)} className="min-h-[48px]">
            <Pause className="h-4 w-4" strokeWidth={2} aria-hidden="true" />Pause / Stopp
          </Button>
        ) : (
          <Button onClick={() => update(startTrip)} className="min-h-[48px]">
            <Play className="h-4 w-4" strokeWidth={2} aria-hidden="true" />Start
          </Button>
        )}
        <Button variant="danger" onClick={() => setDialog("reset")} className="min-h-[48px]">
          <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />Reset
        </Button>
        <Button variant="secondary" onClick={() => setDialog("calib")} className="min-h-[48px]">
          <Ruler className="h-4 w-4" strokeWidth={2} aria-hidden="true" />Kalibrieren
        </Button>
        <Button variant="secondary" onClick={() => setDialog("waypoint")} className="min-h-[48px]">
          <MapPin className="h-4 w-4" strokeWidth={2} aria-hidden="true" />Wegpunkt setzen
        </Button>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-2">
        {[10, -10, 100, -100].map((d) => (
          <Button key={d} variant="secondary" onClick={() => update((t) => addManualCorrection(t, d))} className="min-h-[48px]">
            {d > 0 ? `+${d}m` : `${d}m`}
          </Button>
        ))}
      </div>

      {/* GPS-Simulation */}
      {/* TODO: durch echte GPS-Updates ersetzen (expo-location) */}
      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-rally" strokeWidth={2} aria-hidden="true" />
          <h2 className="min-w-0 flex-1 text-subtitle text-foreground">GPS-Simulation</h2>
          <Button variant={simOn ? "danger" : "secondary"} disabled={!trip.isRunning} onClick={() => setSimOn((s) => !s)} className="min-h-[48px]">
            {simOn ? "Simulation stoppen" : "Simulation starten"}
          </Button>
        </div>
        <label className="mt-3 block text-caption text-muted-foreground" htmlFor="sim-speed">
          Simulierte Geschwindigkeit: {(simSpeed * 3.6).toFixed(0)} km/h
        </label>
        <input
          id="sim-speed"
          type="range"
          min={1}
          max={60}
          value={simSpeed}
          onChange={(e) => setSimSpeed(Number(e.target.value))}
          className="mt-2 h-11 w-full accent-[color:var(--rally)]"
        />
        {!trip.isRunning && <p className="mt-1 text-caption text-muted-foreground">Trip zuerst starten.</p>}
      </div>

      {/* Wegpunkte */}
      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-subtitle text-foreground">Wegpunkte</h2>
        {trip.waypoints.length === 0 ? (
          <p className="text-caption text-muted-foreground">Noch keine Wegpunkte. Über „Wegpunkt setzen“ oder CSV-Import in den Einstellungen anlegen.</p>
        ) : (
          <ul className="space-y-2">
            {trip.waypoints.map((w) => (
              <li key={w.id} className="flex items-center gap-3 rounded-md border border-border bg-elevated px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body text-foreground">{w.name || "Wegpunkt"} · {formatKm(w.distance)}</div>
                  {w.note && <div className="truncate text-caption text-muted-foreground">{w.note}</div>}
                  {w.splitTime != null && <div className="text-caption text-rally">erreicht bei {formatClock(w.splitTime)}</div>}
                </div>
                <button
                  type="button"
                  aria-label="Wegpunkt löschen"
                  onClick={() => update((t) => removeWaypoint(t, w.id))}
                  className="grid h-11 w-11 flex-none place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

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
              {Math.max(0, Math.round(warn.distance - distance))} m
            </div>
            <div className="mt-2 text-subtitle text-foreground">{warn.name || "Wegpunkt"}</div>
            {warn.note && <p className="mt-1 text-caption text-muted-foreground">{warn.note}</p>}
            <p className="mt-4 text-caption text-muted-foreground">Zum Bestätigen tippen</p>
          </div>
        </button>
      )}

      {dialog === "new" && (
        <NewTripDialog
          onClose={() => setDialog(null)}
          onCreate={(name, mode, total, targetTimeSeconds, targetSpeed) => {
            const t: Trip = { ...createTrip(mode, total, name), targetTimeSeconds, targetSpeed, warningDistance: trip.warningDistance };
            setTrips((prev) => [...prev, t]);
            setActiveId(t.id);
            setDialog(null);
          }}
        />
      )}

      {dialog === "calib" && <CalibrationDialog trip={trip} onClose={() => setDialog(null)} onApply={(m) => { update((t) => setCalibrationFactor(t, m)); setDialog(null); }} />}

      {dialog === "waypoint" && (
        <WaypointDialog
          defaultDistance={Math.round(distance)}
          onClose={() => setDialog(null)}
          onAdd={(d, n, note) => { update((t) => addWaypoint(t, d, n, note)); setDialog(null); }}
        />
      )}

      {dialog === "reset" && (
        <Modal title="Trip zurücksetzen?" onClose={() => setDialog(null)}>
          <p className="text-body text-muted-foreground">Distanz, Zeit und Wegpunkt-Zeiten werden zurückgesetzt. Kalibrierung und Wegpunkte bleiben erhalten.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>Abbrechen</Button>
            <Button variant="danger" onClick={() => { update(resetTrip); setDismissed([]); setDialog(null); }}>Zurücksetzen</Button>
          </div>
        </Modal>
      )}

      {dialog === "settings" && (
        <Modal title="Trip-Master Einstellungen" onClose={() => setDialog(null)}>
          <TripMasterSettings
            warningDistance={trip.warningDistance}
            onWarningDistanceChange={(m) => setTrips((prev) => prev.map((t) => setWarningDistance(t, m)))}
            onImportWaypoints={(rows) => update((t) => rows.reduce((acc, r) => addWaypoint(acc, r.distance, r.name, r.note), t))}
          />
        </Modal>
      )}
    </div>
  );
}

function NewTripDialog({
  onClose, onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, mode: RallyeMode, total: number, targetTimeSeconds?: number, targetSpeed?: number) => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<RallyeMode>("bestzeit");
  const [total, setTotal] = useState(10000);
  const [targetMin, setTargetMin] = useState(0);
  const [targetSpeed, setTargetSpeed] = useState(50);

  return (
    <Modal title="Neuen Trip erstellen" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Trip C" /></Field>
        <Field label="Modus">
          <Select value={mode} onChange={(e) => setMode(e.target.value as RallyeMode)}>
            <option value="bestzeit">Bestzeitrallye</option>
            <option value="durchschnitt">Durchschnitts-Rallye</option>
          </Select>
        </Field>
        <Field label="Gesamtstrecke (m)"><NumInput value={total} onChange={(e) => setTotal(Number(e.target.value) || 0)} /></Field>
        {mode === "durchschnitt" && (
          <>
            <Field label="Sollzeit (Minuten)" hint="0 = aus Soll-Ø berechnen">
              <NumInput value={targetMin} onChange={(e) => setTargetMin(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Soll-Ø (km/h)"><NumInput value={targetSpeed} onChange={(e) => setTargetSpeed(Number(e.target.value) || 0)} /></Field>
          </>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
        <Button
          onClick={() => onCreate(
            name.trim() || "Neuer Trip",
            mode,
            total,
            mode === "durchschnitt" && targetMin > 0 ? targetMin * 60 : undefined,
            mode === "durchschnitt" ? targetSpeed : undefined,
          )}
        >
          Erstellen
        </Button>
      </div>
    </Modal>
  );
}

function CalibrationDialog({ trip, onClose, onApply }: { trip: Trip; onClose: () => void; onApply: (roadbookMeters: number) => void }) {
  const [meters, setMeters] = useState(Math.round(trip.rawGpsMeters));
  return (
    <Modal title="Kalibrieren" onClose={onClose}>
      <p className="mb-3 text-caption text-muted-foreground">
        Roh-GPS aktuell: {formatKm(trip.rawGpsMeters)}. Gib die Roadbook-Meter für dieselbe Strecke ein.
      </p>
      <Field label="Roadbook-Distanz (m)"><NumInput value={meters} onChange={(e) => setMeters(Number(e.target.value) || 0)} /></Field>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
        <Button disabled={trip.rawGpsMeters <= 0 || meters <= 0} onClick={() => onApply(meters)}>Übernehmen</Button>
      </div>
    </Modal>
  );
}

function WaypointDialog({
  defaultDistance, onClose, onAdd,
}: { defaultDistance: number; onClose: () => void; onAdd: (d: number, name: string, note: string) => void }) {
  const [distance, setDistance] = useState(defaultDistance);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => { first.current?.querySelector("input")?.focus(); }, []);
  return (
    <Modal title="Wegpunkt setzen" onClose={onClose}>
      <div className="space-y-3" ref={first}>
        <Field label="Distanz (m)"><NumInput value={distance} onChange={(e) => setDistance(Number(e.target.value) || 0)} /></Field>
        <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Zeitkontrolle" /></Field>
        <Field label="Notiz"><TextArea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
        <Button onClick={() => onAdd(distance, name.trim(), note.trim())}>Hinzufügen</Button>
      </div>
    </Modal>
  );
}

export type { Waypoint };
