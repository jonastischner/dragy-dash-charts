import type { Record } from "./types";

export interface UbxParseResult {
  records: Record[];
  /**
   * Aufnahmebeginn als Epoch-ms, aus der GPS-Zeit der ersten brauchbaren
   * NAV-PVT-Nachricht. null, wenn keine Nachricht eine gültige Zeit trug.
   * Bewusst zeitzonenfrei gespeichert – formatiert wird erst bei der Anzeige.
   */
  startedAt: number | null;
  /** Kurzbeschreibung für die Import-Rückmeldung, z.B. „1129 Punkte · 10 Hz". */
  info: string;
}

// Parse UBX NAV-PVT messages (Class 0x01, ID 0x07, payload 92 bytes)
// Returns time in seconds (from first record), speed km/h, height m.
export function parseUbx(buf: ArrayBuffer): UbxParseResult {
  const data = new Uint8Array(buf);
  const dv = new DataView(buf);
  const out: Record[] = [];
  let i = 0;
  let firstITow: number | null = null;
  let lastITow: number | null = null;
  let weekOffsetMs = 0; // handle week rollover
  let startedAt: number | null = null;
  while (i < data.length - 8) {
    if (data[i] === 0xb5 && data[i + 1] === 0x62) {
      const cls = data[i + 2];
      const id = data[i + 3];
      const len = dv.getUint16(i + 4, true);
      if (i + 6 + len + 2 > data.length) break;
      if (cls === 0x01 && id === 0x07 && len === 92) {
        const p = i + 6;
        // checksum
        let a = 0, b = 0;
        for (let k = i + 2; k < p + len; k++) { a = (a + data[k]) & 0xff; b = (b + a) & 0xff; }
        if (a === data[p + len] && b === data[p + len + 1]) {
          const iTow = dv.getUint32(p + 0, true);      // ms
          const fixType = dv.getUint8(p + 20);
          const hMSL = dv.getInt32(p + 36, true);      // mm
          const gSpeed = dv.getInt32(p + 60, true);    // mm/s
          if (fixType >= 2) {
            if (startedAt === null) startedAt = pvtEpochMs(dv, p);
            if (firstITow === null) firstITow = iTow;
            if (lastITow !== null && iTow + weekOffsetMs < lastITow) weekOffsetMs += 7 * 24 * 3600 * 1000;
            const abs = iTow + weekOffsetMs;
            lastITow = abs;
            out.push({
              t: (abs - firstITow!) / 1000,
              speedKmh: (gSpeed / 1000) * 3.6,
              heightM: hMSL / 1000,
            });
          }
        }
      }
      i += 6 + len + 2;
    } else {
      i++;
    }
  }
  return { records: out, startedAt, info: describe(out) };
}

/**
 * UTC-Zeit einer NAV-PVT-Nachricht als Epoch-ms.
 *
 * Das Empfänger-Datum gilt nur, wenn der Empfänger es selbst als gültig
 * markiert – sonst steht dort ein Platzhalter (oft 1.1.2000), der als
 * Session-Datum schlimmer wäre als gar keins. Deshalb null statt Rateversuch.
 */
function pvtEpochMs(dv: DataView, p: number): number | null {
  const valid = dv.getUint8(p + 11);
  const VALID_DATE = 0x01, VALID_TIME = 0x02;
  if ((valid & (VALID_DATE | VALID_TIME)) !== (VALID_DATE | VALID_TIME)) return null;
  const year = dv.getUint16(p + 4, true);
  const month = dv.getUint8(p + 6);
  const day = dv.getUint8(p + 7);
  const hour = dv.getUint8(p + 8);
  const min = dv.getUint8(p + 9);
  const sec = dv.getUint8(p + 10);
  // nano trägt den Bruchteil der Sekunde und darf negativ sein (Sekunde
  // wurde aufgerundet) – ohne Korrektur läge die Zeit bis zu 0,5 s daneben.
  const nano = dv.getInt32(p + 16, true);
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || min > 59 || sec > 60) return null;
  const ms = Date.UTC(year, month - 1, day, hour, min, Math.min(sec, 59)) + Math.round(nano / 1e6);
  return Number.isFinite(ms) ? ms : null;
}

function describe(records: Record[]): string {
  if (records.length < 2) return `${records.length} Punkte`;
  const dur = records[records.length - 1].t - records[0].t;
  if (dur <= 0) return `${records.length} Punkte`;
  const hz = Math.round((records.length - 1) / dur);
  return `${records.length} Punkte · ${hz} Hz`;
}
