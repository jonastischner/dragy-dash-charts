import type { Record } from "./types";

// Parse UBX NAV-PVT messages (Class 0x01, ID 0x07, payload 92 bytes)
// Returns time in seconds (from first record), speed km/h, height m.
export function parseUbx(buf: ArrayBuffer): Record[] {
  const data = new Uint8Array(buf);
  const dv = new DataView(buf);
  const out: Record[] = [];
  let i = 0;
  let firstITow: number | null = null;
  let lastITow: number | null = null;
  let weekOffsetMs = 0; // handle week rollover
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
  return out;
}
