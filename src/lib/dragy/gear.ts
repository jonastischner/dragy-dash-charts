// Utilities für Getriebe-Presets: Reifen-Parsing und RPM-Faktor-Berechnung.

// Parst gängige Reifenbezeichnungen wie "225/45R17" oder "225/45 ZR 17"
// und liefert den Abrollumfang in Metern. Fällt auf null zurück, wenn kein
// Match möglich ist.
export function tireCircumferenceM(spec: string): number | null {
  if (!spec) return null;
  const m = spec.replace(/\s+/g, "").match(/^(\d{3})\/(\d{2,3})[A-Z]*R?(\d{2})$/i);
  if (!m) return null;
  const width = parseInt(m[1], 10);       // mm
  const aspect = parseInt(m[2], 10);      // %
  const rimInch = parseInt(m[3], 10);     // Zoll
  const rimMm = rimInch * 25.4;
  const sidewallMm = (width * aspect) / 100;
  const diameterMm = rimMm + 2 * sidewallMm;
  // Etwas Umfangs-Reduktion durch dynamischen Rollradius (~97%).
  const dynamic = 0.97;
  return (Math.PI * diameterMm * dynamic) / 1000; // m
}

// rpm pro km/h aus Getriebeübersetzung, Endübersetzung und Reifen.
// v_kmh -> v_m/s = v/3.6; wheelRpm = 60*v/(3.6*U); engineRpm = wheelRpm * gearRatio * finalDrive
// => rpm/kmh = (60 * gearRatio * finalDrive) / (3.6 * U_m)
export function computeRpmFactor(
  gearRatio: number,
  finalDrive: number,
  tireSpec: string,
): number | null {
  const U = tireCircumferenceM(tireSpec);
  if (!U || !Number.isFinite(gearRatio) || !Number.isFinite(finalDrive) || gearRatio <= 0 || finalDrive <= 0) return null;
  return (60 * gearRatio * finalDrive) / (3.6 * U);
}
