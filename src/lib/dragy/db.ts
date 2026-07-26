import type { Vehicle, Session, Segment } from "./types";

const DB_NAME = "dragy-analyse";
const DB_VERSION = 1;
const STORES = ["vehicles", "sessions", "segments", "meta"] as const;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === "meta" ? "key" : "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function all<T>(store: string): Promise<T[]> { return tx<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>); }
async function put(store: string, val: any) { return tx(store, "readwrite", (s) => s.put(val)); }
async function del(store: string, key: string) { return tx(store, "readwrite", (s) => s.delete(key)); }
async function clearStore(store: string) { return tx(store, "readwrite", (s) => s.clear()); }

export const db = {
  loadAll: async () => ({
    vehicles: await all<Vehicle>("vehicles"),
    sessions: await all<Session>("sessions"),
    segments: await all<Segment>("segments"),
    activeVehicleId: (await tx<any>("meta", "readonly", (s) => s.get("activeVehicleId")))?.value ?? null,
  }),
  putVehicle: (v: Vehicle) => put("vehicles", v),
  delVehicle: (id: string) => del("vehicles", id),
  putSession: (v: Session) => put("sessions", v),
  delSession: (id: string) => del("sessions", id),
  putSegment: (v: Segment) => put("segments", v),
  delSegment: (id: string) => del("segments", id),
  setActive: (id: string | null) => put("meta", { key: "activeVehicleId", value: id }),
  clearAll: async () => { for (const s of STORES) await clearStore(s); },
  upsertBatch: async (data: { vehicles?: Vehicle[]; sessions?: Session[]; segments?: Segment[] }) => {
    if (data.vehicles) for (const v of data.vehicles) await put("vehicles", v);
    if (data.sessions) for (const v of data.sessions) await put("sessions", v);
    if (data.segments) for (const v of data.segments) await put("segments", v);
  },
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
