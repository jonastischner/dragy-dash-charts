import { useEffect, useState, useCallback, useRef } from "react";
import { db, uid } from "./db";
import type { AppState, Vehicle, Session, Segment, GearboxDef, FinalDriveDef, TireDef, DriveSetup } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { pushLocal, pushDelete, pushActiveVehicle } from "./sync";
import { migrateSessionModule } from "./modules";
import { sessionTimestamp } from "./sessionTime";


const DEFAULT_VEHICLE: Omit<Vehicle, "id" | "name"> = {
  mass: 1500,
  cd: 0.30,
  area: 2.2,
  crr: 0.013,
  calibrated: false,
  smoothingWindow: 9,
  rpmFactorDefault: 40,
  rpmMatch: { maxRpm: 7000, maxKmh: 175 },
  dragCurve: [
    { rpm: 1000, ps: 5 }, { rpm: 2000, ps: 10 }, { rpm: 3000, ps: 15 },
    { rpm: 4000, ps: 22 }, { rpm: 5000, ps: 30 }, { rpm: 6000, ps: 40 }, { rpm: 7000, ps: 52 },
  ],
};

export function newVehicle(name: string): Vehicle {
  return { id: uid(), name, ...DEFAULT_VEHICLE, updatedAt: Date.now() };
}

export function duplicateVehicle(source: Vehicle): Vehicle {
  const idMap = new Map<string, string>();
  const newId = () => { const id = uid(); idMap.set(id, id); return id; };

  const gearboxDefs: GearboxDef[] = (source.gearboxDefs ?? []).map((g) => ({
    ...g,
    id: newId(),
    gears: g.gears.map((gr) => ({ ...gr, id: newId() })),
  }));
  const finalDrives: FinalDriveDef[] = (source.finalDrives ?? []).map((f) => ({ ...f, id: newId() }));
  const tires: TireDef[] = (source.tires ?? []).map((t) => ({ ...t, id: newId() }));

  const setupIdMap = new Map<string, string>();
  const setups: DriveSetup[] = (source.setups ?? []).map((s) => {
    const newSetupId = newId();
    setupIdMap.set(s.id, newSetupId);
    return {
      ...s,
      id: newSetupId,
      gearboxId: gearboxDefs.find((g) => g.id === s.gearboxId)?.id ?? s.gearboxId,
      finalDriveId: finalDrives.find((f) => f.id === s.finalDriveId)?.id ?? s.finalDriveId,
      tireId: tires.find((t) => t.id === s.tireId)?.id ?? s.tireId,
    };
  });

  const defaultSetupId = source.defaultSetupId ? setupIdMap.get(source.defaultSetupId) ?? undefined : undefined;

  return {
    ...source,
    id: uid(),
    name: `Kopie von ${source.name}`,
    gearboxDefs,
    finalDrives,
    tires,
    setups,
    defaultSetupId,
    updatedAt: Date.now(),
  };
}

const initial: AppState = { vehicles: [], sessions: [], segments: [], activeVehicleId: null };

// Modulweiter Zustand: alle useAppStore()-Instanzen teilen sich Daten,
// damit z.B. die globale Fahrzeugauswahl im Header sofort mitbekommt,
// wenn in der Garage ein Fahrzeug gespeichert wird.
let sharedState: AppState = initial;
let sharedReady = false;
const listeners = new Set<() => void>();
function publish(s: AppState) {
  sharedState = s;
  sharedReady = true;
  listeners.forEach((l) => l());
}

// Simple background push helper (fire-and-forget)
function bg<T>(p: Promise<T>) { p.catch((e) => console.warn("[sync] push failed", e)); }

export function useAppStore() {
  const [state, setState] = useState<AppState>(sharedState);
  const [ready, setReady] = useState(sharedReady);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const emailRef = useRef<string | null>(null);

  useEffect(() => {
    const sync = () => { setState(sharedState); setReady(sharedReady); };
    listeners.add(sync);
    (async () => {
      const s = (await db.loadAll()) as AppState;
      // Migration: Sessions ohne Modul aus Altdaten (kind/category) ableiten.
      const missing = s.sessions.filter((x) => !x.module);
      for (const sess of missing) {
        const segs = s.segments.filter((g) => g.sessionId === sess.id);
        sess.module = migrateSessionModule(sess, segs);
        await db.putSession(sess);
      }
      publish(s);
    })();
    return () => { listeners.delete(sync); };
  }, []);




  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) { setUserEmail(data.user?.email ?? null); emailRef.current = data.user?.email ?? null; }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const email = session?.user?.email ?? null;
      setUserEmail(email);
      emailRef.current = email;
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const refresh = useCallback(async () => {
    const s = await db.loadAll();
    publish(s as AppState);
  }, []);


  const stamp = <T extends object>(v: T): T & { updatedAt: number } => ({ ...v, updatedAt: Date.now() });

  return {
    state,
    ready,
    userEmail,
    refresh,
    setActive: async (id: string | null) => {
      await db.setActive(id);
      await db.setMeta("activeVehicleUpdatedAt", Date.now());
      await refresh();
      bg(pushActiveVehicle(id));
    },
    saveVehicle: async (v: Vehicle) => {
      const stamped = stamp(v);
      await db.putVehicle(stamped);
      await refresh();
      bg(pushLocal("vehicle", stamped));
    },
    deleteVehicle: async (id: string) => {
      const now = Date.now();
      for (const s of state.sessions.filter((x) => x.vehicleId === id)) {
        for (const seg of state.segments.filter((g) => g.sessionId === s.id)) {
          await db.delSegment(seg.id);
          await db.addTombstone({ id: seg.id, kind: "segment", deletedAt: now });
          bg(pushDelete("segment", seg.id, now).then((ok) => { if (ok) db.delTombstone(seg.id); }));
        }
        await db.delSession(s.id);
        await db.addTombstone({ id: s.id, kind: "session", deletedAt: now });
        bg(pushDelete("session", s.id, now).then((ok) => { if (ok) db.delTombstone(s.id); }));
      }
      await db.delVehicle(id);
      await db.addTombstone({ id, kind: "vehicle", deletedAt: now });
      bg(pushDelete("vehicle", id, now).then((ok) => { if (ok) db.delTombstone(id); }));
      if (state.activeVehicleId === id) {
        await db.setActive(null);
        await db.setMeta("activeVehicleUpdatedAt", now);
        bg(pushActiveVehicle(null));
      }
      await refresh();
    },
    duplicateVehicle: async (source: Vehicle) => {
      const copy = duplicateVehicle(source);
      await db.putVehicle(copy);
      await refresh();
      bg(pushLocal("vehicle", copy));
      return copy;
    },
    saveSession: async (s: Session) => {

      const stamped = stamp(s);
      await db.putSession(stamped);
      await refresh();
      bg(pushLocal("session", stamped));
    },
    deleteSession: async (id: string) => {
      const now = Date.now();
      for (const seg of state.segments.filter((g) => g.sessionId === id)) {
        await db.delSegment(seg.id);
        await db.addTombstone({ id: seg.id, kind: "segment", deletedAt: now });
        bg(pushDelete("segment", seg.id, now).then((ok) => { if (ok) db.delTombstone(seg.id); }));
      }
      await db.delSession(id);
      await db.addTombstone({ id, kind: "session", deletedAt: now });
      bg(pushDelete("session", id, now).then((ok) => { if (ok) db.delTombstone(id); }));
      await refresh();
    },
    saveSegment: async (g: Segment) => {
      const stamped = stamp(g);
      await db.putSegment(stamped);
      await refresh();
      bg(pushLocal("segment", stamped));
    },
    deleteSegment: async (id: string) => {
      const now = Date.now();
      await db.delSegment(id);
      await db.addTombstone({ id, kind: "segment", deletedAt: now });
      bg(pushDelete("segment", id, now).then((ok) => { if (ok) db.delTombstone(id); }));
      await refresh();
    },
    clearAll: async () => { await db.clearAll(); await refresh(); },
    // Zentrale Farbvergabe: allen Läufen (optional nur eines Fahrzeugs)
    // möglichst unterschiedliche Farben aus der Palette zuweisen.
    recolorSegments: async (opts?: { vehicleId?: string | null; onlyUnassigned?: boolean }) => {
      const sessionsById = new Map(sharedState.sessions.map((s) => [s.id, s]));
      const scoped = sharedState.segments.filter((g) => {
        const s = sessionsById.get(g.sessionId);
        if (!s) return false;
        return !opts?.vehicleId || s.vehicleId === opts.vehicleId;
      });
      const ordered = [...scoped].sort((a, b) => {
        const sa = sessionsById.get(a.sessionId)!, sb = sessionsById.get(b.sessionId)!;
        return (sessionTimestamp(sa) - sessionTimestamp(sb)) || (a.startT - b.startT) || a.id.localeCompare(b.id);
      });

      let changed = 0;
      if (opts?.onlyUnassigned) {
        const used = new Set<string>();
        const dupes: Segment[] = [];
        for (const g of ordered) {
          const c = normalizeHex(g.color);
          if (c && !used.has(c)) used.add(c);
          else dupes.push(g);
        }
        for (const g of dupes) {
          const color = nextUnusedColor([...used]);
          used.add(color);
          const stamped = stamp({ ...g, color });
          await db.putSegment(stamped);
          bg(pushLocal("segment", stamped));
          changed++;
        }
      } else {
        for (let i = 0; i < ordered.length; i++) {
          const color = pickColor(i);
          if (normalizeHex(ordered[i].color) === color) continue;
          const stamped = stamp({ ...ordered[i], color });
          await db.putSegment(stamped);
          bg(pushLocal("segment", stamped));
          changed++;
        }
      }
      await refresh();
      return { total: ordered.length, changed };
    },
    importBatch: async (data: { vehicles?: Vehicle[]; sessions?: Session[]; segments?: Segment[] }) => {
      // Stamp updatedAt so imports propagate to cloud on next sync
      const now = Date.now();
      const stampArr = <T extends object>(arr?: T[]) => arr?.map((x) => ({ ...x, updatedAt: (x as any).updatedAt ?? now }));
      await db.upsertBatch({
        vehicles: stampArr(data.vehicles),
        sessions: stampArr(data.sessions),
        segments: stampArr(data.segments),
      });
      await refresh();
    },
  };
}

// Möglichst gut unterscheidbare Palette (Farbton weit gestreut, wechselnde Helligkeit).
export const SEGMENT_COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#8b5cf6",
  "#14b8a6", "#e11d48", "#0ea5e9", "#eab308", "#7c3aed",
  "#10b981", "#fb7185", "#2563eb", "#d97706", "#c026d3",
  "#65a30d", "#0891b2", "#f472b6", "#4ade80", "#fca5a5",
];
export function pickColor(i: number) { return SEGMENT_COLORS[((i % SEGMENT_COLORS.length) + SEGMENT_COLORS.length) % SEGMENT_COLORS.length]; }

function normalizeHex(c?: string) { return (c ?? "").trim().toLowerCase(); }

/** Erste Palettenfarbe, die noch nicht verwendet wird – sonst die am seltensten genutzte. */
export function nextUnusedColor(usedColors: Array<string | undefined>) {
  const counts = new Map<string, number>();
  for (const c of usedColors) {
    const k = normalizeHex(c);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = SEGMENT_COLORS[0], bestCount = Infinity;
  for (const c of SEGMENT_COLORS) {
    const n = counts.get(c) ?? 0;
    if (n === 0) return c;
    if (n < bestCount) { best = c; bestCount = n; }
  }
  return best;
}

