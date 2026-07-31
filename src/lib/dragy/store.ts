import { useEffect, useState, useCallback, useRef } from "react";
import { db, uid } from "./db";
import type { AppState, Vehicle, Session, Segment, GearboxDef, FinalDriveDef, TireDef, DriveSetup } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { pushLocal, pushDelete, pushActiveVehicle } from "./sync";


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

const initial: AppState = { vehicles: [], sessions: [], segments: [], activeVehicleId: null };

// Simple background push helper (fire-and-forget)
function bg<T>(p: Promise<T>) { p.catch((e) => console.warn("[sync] push failed", e)); }

export function useAppStore() {
  const [state, setState] = useState<AppState>(initial);
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const emailRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const s = await db.loadAll();
      setState(s as AppState);
      setReady(true);
    })();
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
    setState(s as AppState);
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

export const SEGMENT_COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#8b5cf6",
];
export function pickColor(i: number) { return SEGMENT_COLORS[i % SEGMENT_COLORS.length]; }
