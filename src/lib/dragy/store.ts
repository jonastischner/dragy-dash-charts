import { useEffect, useState, useCallback } from "react";
import { db, uid } from "./db";
import type { AppState, Vehicle, Session, Segment } from "./types";

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
  return { id: uid(), name, ...DEFAULT_VEHICLE };
}

const initial: AppState = { vehicles: [], sessions: [], segments: [], activeVehicleId: null };

export function useAppStore() {
  const [state, setState] = useState<AppState>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await db.loadAll();
      setState(s as AppState);
      setReady(true);
    })();
  }, []);

  const refresh = useCallback(async () => {
    const s = await db.loadAll();
    setState(s as AppState);
  }, []);

  return {
    state,
    ready,
    refresh,
    setActive: async (id: string | null) => { await db.setActive(id); await refresh(); },
    saveVehicle: async (v: Vehicle) => { await db.putVehicle(v); await refresh(); },
    deleteVehicle: async (id: string) => {
      // cascade
      for (const s of state.sessions.filter((x) => x.vehicleId === id)) {
        for (const seg of state.segments.filter((g) => g.sessionId === s.id)) await db.delSegment(seg.id);
        await db.delSession(s.id);
      }
      await db.delVehicle(id);
      if (state.activeVehicleId === id) await db.setActive(null);
      await refresh();
    },
    saveSession: async (s: Session) => { await db.putSession(s); await refresh(); },
    deleteSession: async (id: string) => {
      for (const seg of state.segments.filter((g) => g.sessionId === id)) await db.delSegment(seg.id);
      await db.delSession(id); await refresh();
    },
    saveSegment: async (g: Segment) => { await db.putSegment(g); await refresh(); },
    deleteSegment: async (id: string) => { await db.delSegment(id); await refresh(); },
    clearAll: async () => { await db.clearAll(); await refresh(); },
    importBatch: async (data: { vehicles?: Vehicle[]; sessions?: Session[]; segments?: Segment[] }) => {
      await db.upsertBatch(data); await refresh();
    },
  };
}

export const SEGMENT_COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#8b5cf6",
];
export function pickColor(i: number) { return SEGMENT_COLORS[i % SEGMENT_COLORS.length]; }
