import { supabase } from "@/integrations/supabase/client";
import { db } from "./db";
import type { Vehicle, Session, Segment } from "./types";

const TABLES = {
  vehicle: "cloud_vehicles",
  session: "cloud_sessions",
  segment: "cloud_segments",
} as const;

type Kind = keyof typeof TABLES;

interface CloudRow {
  user_id: string;
  id: string;
  data: any;
  updated_at: number;
  deleted: boolean;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function pushLocal(kind: Kind, item: Vehicle | Session | Segment) {
  const userId = await currentUserId();
  if (!userId || !navigator.onLine) return;
  const table = TABLES[kind];
  const updated_at = (item as any).updatedAt ?? Date.now();
  await supabase.from(table).upsert({
    user_id: userId,
    id: item.id,
    data: item as any,
    updated_at,
    deleted: false,
  });
}

export async function pushDelete(kind: Kind, id: string, deletedAt: number) {
  const userId = await currentUserId();
  if (!userId || !navigator.onLine) return false;
  const table = TABLES[kind];
  const { error } = await supabase.from(table).upsert({
    user_id: userId,
    id,
    data: {},
    updated_at: deletedAt,
    deleted: true,
  });
  return !error;
}

export async function pushActiveVehicle(activeVehicleId: string | null) {
  const userId = await currentUserId();
  if (!userId || !navigator.onLine) return;
  await supabase.from("cloud_meta").upsert({
    user_id: userId,
    active_vehicle_id: activeVehicleId,
    updated_at: Date.now(),
  });
}

export interface SyncResult {
  pulledVehicles: number;
  pulledSessions: number;
  pulledSegments: number;
  pushed: number;
  deleted: number;
}

export async function syncAll(): Promise<SyncResult> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Nicht angemeldet");
  if (!navigator.onLine) throw new Error("Kein Internet");

  const result: SyncResult = { pulledVehicles: 0, pulledSessions: 0, pulledSegments: 0, pushed: 0, deleted: 0 };

  // Fetch remote
  const [rv, rs, rg, rm] = await Promise.all([
    supabase.from(TABLES.vehicle).select("*").eq("user_id", userId),
    supabase.from(TABLES.session).select("*").eq("user_id", userId),
    supabase.from(TABLES.segment).select("*").eq("user_id", userId),
    supabase.from("cloud_meta").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  if (rv.error) throw rv.error;
  if (rs.error) throw rs.error;
  if (rg.error) throw rg.error;

  const remoteMap = <T,>(rows: CloudRow[] | null | undefined): Map<string, CloudRow> => {
    const m = new Map<string, CloudRow>();
    (rows ?? []).forEach((r) => m.set(r.id, r));
    return m;
  };

  const localState = await db.loadAll();
  const tombstones = await db.allTombstones();
  const tombMap = new Map(tombstones.map((t) => [`${t.kind}:${t.id}`, t]));

  const merge = async (
    kind: Kind,
    remote: CloudRow[] | null,
    local: any[],
    localPut: (v: any) => Promise<any>,
    localDel: (id: string) => Promise<any>,
    counter: "pulledVehicles" | "pulledSessions" | "pulledSegments",
  ) => {
    const remoteById = remoteMap(remote);
    const localById = new Map<string, any>(local.map((x) => [x.id, x]));
    const table = TABLES[kind];

    // Apply remote → local
    for (const r of remoteById.values()) {
      const l = localById.get(r.id);
      const localTs = l?.updatedAt ?? 0;
      const tomb = tombMap.get(`${kind}:${r.id}`);
      const tombTs = tomb?.deletedAt ?? 0;
      if (r.deleted) {
        // remote deletion
        if (l && r.updated_at > localTs) {
          await localDel(r.id);
          result.deleted++;
        }
      } else {
        // remote alive
        if (tomb && tombTs >= r.updated_at) {
          // local deleted more recently → will push tombstone later
          continue;
        }
        if (!l || r.updated_at > localTs) {
          await localPut(r.data);
          result[counter]++;
        }
      }
    }

    // Push local → remote
    for (const l of localById.values()) {
      const r = remoteById.get(l.id);
      const localTs = l.updatedAt ?? 0;
      if (!r || (localTs > r.updated_at && !r.deleted) || (r.deleted && localTs > r.updated_at)) {
        await supabase.from(table).upsert({
          user_id: userId,
          id: l.id,
          data: l as any,
          updated_at: localTs || Date.now(),
          deleted: false,
        });
        result.pushed++;
      }
    }

    // Push tombstones
    for (const t of tombstones.filter((t) => t.kind === kind)) {
      const r = remoteById.get(t.id);
      if (!r || t.deletedAt > r.updated_at) {
        await supabase.from(table).upsert({
          user_id: userId,
          id: t.id,
          data: {},
          updated_at: t.deletedAt,
          deleted: true,
        });
      }
      await db.delTombstone(t.id);
    }
  };

  await merge("vehicle", rv.data as any, localState.vehicles, db.putVehicle, db.delVehicle, "pulledVehicles");
  await merge("session", rs.data as any, localState.sessions, db.putSession, db.delSession, "pulledSessions");
  await merge("segment", rg.data as any, localState.segments, db.putSegment, db.delSegment, "pulledSegments");

  // Meta / active vehicle
  const remoteMeta = rm.data as any;
  const localMetaTs = (await db.getMeta("activeVehicleUpdatedAt")) ?? 0;
  const localActive = localState.activeVehicleId;
  if (remoteMeta && remoteMeta.updated_at > localMetaTs) {
    await db.setActive(remoteMeta.active_vehicle_id ?? null);
    await db.setMeta("activeVehicleUpdatedAt", remoteMeta.updated_at);
  } else if (!remoteMeta || localMetaTs > (remoteMeta?.updated_at ?? 0)) {
    await supabase.from("cloud_meta").upsert({
      user_id: userId,
      active_vehicle_id: localActive,
      updated_at: localMetaTs || Date.now(),
    });
  }

  await db.setMeta("lastSyncAt", Date.now());
  return result;
}

export async function getLastSyncAt(): Promise<number | null> {
  return (await db.getMeta("lastSyncAt")) ?? null;
}
