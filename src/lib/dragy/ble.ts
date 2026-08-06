import type { Record as R } from "./types";

// ---------------------------------------------------------------------------
// Generische BLE-Anbindung für GPS-Logger (Dragy, P-Gear, Racebox, …).
// Web Bluetooth ist nur in Chrome/Edge (Android, Desktop) verfügbar – nicht in
// Safari/iOS. Das Dragy-Protokoll ist nicht öffentlich dokumentiert, daher sind
// Service-/Characteristic-UUIDs und das Datenformat konfigurierbar und es gibt
// einen Rohdaten-Monitor zum Analysieren unbekannter Geräte.
// ---------------------------------------------------------------------------

export const NORDIC_UART = {
  service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
  notify: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
};

export type StreamFormat = "ubx" | "nmea" | "raw";

export function bleSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).bluetooth;
}

export function toHex(bytes: Uint8Array, max = 64): string {
  const slice = bytes.subarray(0, max);
  let s = "";
  for (let i = 0; i < slice.length; i++) s += slice[i].toString(16).padStart(2, "0") + " ";
  return s.trim() + (bytes.length > max ? ` … (+${bytes.length - max} B)` : "");
}

export function toAscii(bytes: Uint8Array, max = 64): string {
  let s = "";
  const slice = bytes.subarray(0, max);
  for (let i = 0; i < slice.length; i++) {
    const c = slice[i];
    s += c >= 32 && c < 127 ? String.fromCharCode(c) : ".";
  }
  return s;
}

// --- Streaming-Parser -------------------------------------------------------

export interface StreamPoint { tMs: number; speedKmh: number; heightM: number }

interface Parser {
  push(chunk: Uint8Array): StreamPoint[];
  reset(): void;
}

/** Inkrementeller UBX NAV-PVT Parser (Class 0x01, ID 0x07, 92 Byte Payload). */
export function createUbxStreamParser(): Parser {
  let buf = new Uint8Array(0);
  let weekOffsetMs = 0;
  let lastAbs: number | null = null;

  return {
    reset() { buf = new Uint8Array(0); weekOffsetMs = 0; lastAbs = null; },
    push(chunk) {
      const merged = new Uint8Array(buf.length + chunk.length);
      merged.set(buf, 0); merged.set(chunk, buf.length);
      buf = merged;
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const out: StreamPoint[] = [];
      let i = 0;
      while (i + 8 <= buf.length) {
        if (buf[i] !== 0xb5 || buf[i + 1] !== 0x62) { i++; continue; }
        const len = dv.getUint16(i + 4, true);
        if (len > 4096) { i++; continue; }
        if (i + 6 + len + 2 > buf.length) break; // auf mehr Daten warten
        if (buf[i + 2] === 0x01 && buf[i + 3] === 0x07 && len === 92) {
          const p = i + 6;
          let a = 0, b = 0;
          for (let k = i + 2; k < p + len; k++) { a = (a + buf[k]) & 0xff; b = (b + a) & 0xff; }
          if (a === buf[p + len] && b === buf[p + len + 1]) {
            const iTow = dv.getUint32(p + 0, true);
            const fixType = buf[p + 20];
            const hMSL = dv.getInt32(p + 36, true);
            const gSpeed = dv.getInt32(p + 60, true);
            if (fixType >= 2) {
              if (lastAbs !== null && iTow + weekOffsetMs < lastAbs) weekOffsetMs += 7 * 24 * 3600 * 1000;
              const abs = iTow + weekOffsetMs;
              lastAbs = abs;
              out.push({ tMs: abs, speedKmh: (gSpeed / 1000) * 3.6, heightM: hMSL / 1000 });
            }
          }
        }
        i += 6 + len + 2;
      }
      buf = buf.slice(i);
      return out;
    },
  };
}

/** NMEA-Parser: RMC liefert Zeit + Geschwindigkeit, GGA die Höhe. */
export function createNmeaStreamParser(): Parser {
  let text = "";
  let heightM = 0;
  let dayOffsetMs = 0;
  let lastMs: number | null = null;

  const timeToMs = (v: string) => {
    // hhmmss.sss
    const hh = +v.slice(0, 2), mm = +v.slice(2, 4), ss = +v.slice(4);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss)) return null;
    return ((hh * 3600 + mm * 60) * 1000) + Math.round(ss * 1000);
  };

  return {
    reset() { text = ""; heightM = 0; dayOffsetMs = 0; lastMs = null; },
    push(chunk) {
      text += new TextDecoder().decode(chunk);
      const lines = text.split(/\r?\n/);
      text = lines.pop() ?? "";
      const out: StreamPoint[] = [];
      for (const line of lines) {
        const f = line.trim().replace(/^\$/, "").split(",");
        const type = (f[0] ?? "").slice(-3).toUpperCase();
        if (type === "GGA") {
          const h = parseFloat(f[9] ?? "");
          if (Number.isFinite(h)) heightM = h;
        } else if (type === "RMC") {
          if ((f[2] ?? "").toUpperCase() !== "A") continue;
          const base = timeToMs(f[1] ?? "");
          const knots = parseFloat(f[7] ?? "");
          if (base === null || !Number.isFinite(knots)) continue;
          if (lastMs !== null && base + dayOffsetMs < lastMs - 1000) dayOffsetMs += 24 * 3600 * 1000;
          const abs = base + dayOffsetMs;
          lastMs = abs;
          out.push({ tMs: abs, speedKmh: knots * 1.852, heightM });
        }
      }
      return out;
    },
  };
}

export function createParser(format: StreamFormat): Parser {
  if (format === "nmea") return createNmeaStreamParser();
  if (format === "ubx") return createUbxStreamParser();
  return { push: () => [], reset: () => {} };
}

/** Punkte relativ zum ersten Zeitstempel in Session-Records umwandeln. */
export function pointsToRecords(points: StreamPoint[]): R[] {
  if (points.length === 0) return [];
  const t0 = points[0].tMs;
  return points.map((p) => ({ t: (p.tMs - t0) / 1000, speedKmh: p.speedKmh, heightM: p.heightM }));
}

// --- Verbindung ------------------------------------------------------------

export interface BleConnection {
  deviceName: string;
  disconnect(): void;
}

export interface ConnectOptions {
  serviceUuid: string;
  notifyUuid: string;
  onChunk: (bytes: Uint8Array) => void;
  onDisconnect?: () => void;
}

export async function connectBle(opts: ConnectOptions): Promise<BleConnection> {
  const bt = (navigator as any).bluetooth;
  if (!bt) throw new Error("Web Bluetooth wird von diesem Browser nicht unterstützt (iOS/Safari nicht möglich).");
  const service = opts.serviceUuid.trim().toLowerCase();
  const notify = opts.notifyUuid.trim().toLowerCase();
  const device = await bt.requestDevice({
    filters: [{ services: [service] }],
    optionalServices: [service],
  });
  const onGattDisconnected = () => opts.onDisconnect?.();
  device.addEventListener("gattserverdisconnected", onGattDisconnected);
  const server = await device.gatt.connect();
  const svc = await server.getPrimaryService(service);
  const ch = await svc.getCharacteristic(notify);
  ch.addEventListener("characteristicvaluechanged", (ev: any) => {
    const dv: DataView = ev.target.value;
    opts.onChunk(new Uint8Array(dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength)));
  });
  await ch.startNotifications();
  return {
    deviceName: device.name || "BLE-Gerät",
    disconnect() {
      try { ch.stopNotifications?.(); } catch { /* ignore */ }
      try { device.gatt.disconnect(); } catch { /* ignore */ }
      device.removeEventListener("gattserverdisconnected", onGattDisconnected);
    },
  };
}
