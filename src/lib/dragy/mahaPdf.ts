/**
 * PDF-Protokoll im Maha-/MTO-Stil: Diagramm (PS + Nm über Drehzahl) plus
 * Datenblöcke. Reine Vektor-Ausgabe über jsPDF – offline und druckscharf.
 */
import { jsPDF } from "jspdf";
import { computeSegment, W_TO_PS } from "./physics";
import type { Segment, Session, Vehicle } from "./types";

export interface PdfHeaderInfo {
  vehicleType?: string;
  plate?: string;
  tester?: string;
  customer?: string;
}

const COL = {
  wheel: [0, 70, 190] as [number, number, number],
  drag: [0, 140, 70] as [number, number, number],
  engine: [210, 40, 60] as [number, number, number],
  torque: [210, 40, 60] as [number, number, number],
  grid: [225, 120, 130] as [number, number, number],
  gridMinor: [240, 195, 200] as [number, number, number],
  axis: [40, 40, 40] as [number, number, number],
  text: [20, 20, 20] as [number, number, number],
  line: [120, 120, 120] as [number, number, number],
};

const de = (v: number, d = 1) =>
  Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "----,-";

function ceilTo(v: number, step: number) {
  return Math.max(step, Math.ceil(v / step) * step);
}

interface Curve { rpm: number; pWheel: number; pDrag: number; pEngine: number; nm: number }

export interface RunPdfData {
  session: Session;
  segment: Segment;
  vehicle: Vehicle;
}

function buildCurves(d: RunPdfData): Curve[] {
  const samples = computeSegment(d.session, d.segment, d.vehicle)
    .filter((s) => Number.isFinite(s.rpm) && s.rpm > 0 && Number.isFinite(s.pEngineW));
  if (samples.length === 0) return [];

  // 1) Ende abschneiden: sobald nicht mehr beschleunigt wird (Gaswegnahme/Begrenzer),
  //    liegen viele Punkte bei nahezu gleicher Drehzahl mit stark schwankender Leistung
  //    -> das erzeugt sonst eine senkrechte "Fläche" am rechten Diagrammrand.
  let end = samples.length;
  for (let i = samples.length - 1; i > 0; i--) {
    if (samples[i].a > 0.15) { end = i + 1; break; }
  }
  const acc = samples.slice(0, end);

  // 2) Nur monoton steigende Drehzahl behalten (kein Zurückspringen)
  const mono: typeof acc = [];
  let maxRpm = -Infinity;
  for (const s of acc) {
    if (s.rpm > maxRpm) { maxRpm = s.rpm; mono.push(s); }
  }

  // 3) Pro Drehzahl-Bucket mitteln -> eine eindeutige, glatte Kurve
  const BIN = 25;
  const buckets = new Map<number, { n: number; c: Curve }>();
  for (const s of mono) {
    const key = Math.round(s.rpm / BIN);
    const cur = buckets.get(key);
    const add: Curve = {
      rpm: s.rpm,
      pWheel: s.pWheelW * W_TO_PS,
      pDrag: s.pDragW * W_TO_PS,
      pEngine: s.pEngineW * W_TO_PS,
      nm: s.torqueEngineNm,
    };
    if (!cur) buckets.set(key, { n: 1, c: add });
    else {
      cur.n++;
      cur.c.rpm += add.rpm; cur.c.pWheel += add.pWheel; cur.c.pDrag += add.pDrag;
      cur.c.pEngine += add.pEngine; cur.c.nm += add.nm;
    }
  }
  return [...buckets.values()]
    .map(({ n, c }) => ({ rpm: c.rpm / n, pWheel: c.pWheel / n, pDrag: c.pDrag / n, pEngine: c.pEngine / n, nm: c.nm / n }))
    .sort((a, b) => a.rpm - b.rpm);
}


function peaks(curves: Curve[], d: RunPdfData) {
  let pW = -Infinity, pE = -Infinity, pD = -Infinity, nm = -Infinity;
  let pERpm = NaN, nmRpm = NaN, maxRpm = 0;
  for (const c of curves) {
    if (c.pWheel > pW) pW = c.pWheel;
    if (c.pDrag > pD) pD = c.pDrag;
    if (c.pEngine > pE) { pE = c.pEngine; pERpm = c.rpm; }
    if (Number.isFinite(c.nm) && c.nm > nm) { nm = c.nm; nmRpm = c.rpm; }
    if (c.rpm > maxRpm) maxRpm = c.rpm;
  }
  const f = d.segment.rpmFactor || 1;
  const rec = d.session.records.filter((r) => r.t >= d.segment.startT && r.t <= d.segment.endT);
  const vMax = rec.length ? Math.max(...rec.map((r) => r.speedKmh)) : NaN;
  return {
    pWheel: pW, pDrag: pD, pEngine: pE, nm,
    pERpm, nmRpm, maxRpm,
    pEKmh: f ? pERpm / f : NaN,
    nmKmh: f ? nmRpm / f : NaN,
    maxKmh: f ? maxRpm / f : NaN,
    vMax,
  };
}

function drawPolyline(doc: jsPDF, pts: Array<[number, number]>) {
  if (pts.length < 2) return;
  const lines = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]] as [number, number]);
  doc.lines(lines, pts[0][0], pts[0][1]);
}

/** Zeichnet eine komplette Protokollseite in ein bestehendes Dokument. */
function drawPage(doc: jsPDF, d: RunPdfData, info: PdfHeaderInfo) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const curves = buildCurves(d);
  const p = peaks(curves, d);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COL.text);

  /* --- Kopfzeile --- */
  const dt = new Date(d.session.createdAt);
  const stamp = `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${dt.getFullYear()} (${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")})`;
  doc.setFontSize(8);
  doc.text(`Meßdatum: ${stamp}`, M, M);
  doc.text(`${d.vehicle.name} · ${d.session.name} · ${d.segment.name}`, W - M, M, { align: "right" });
  doc.setDrawColor(...COL.line);
  doc.setLineWidth(0.2);
  doc.line(M, M + 1.5, W - M, M + 1.5);

  /* --- Diagrammfläche --- */
  const plot = { x: M + 14, y: M + 6, w: W - 2 * M - 28, h: H * 0.46 };
  const rpmMax = ceilTo(Math.max(p.maxRpm, 1000), 1000);
  const psMax = ceilTo(Math.max(p.pEngine, 50) * 1.15, 100);
  const nmMax = ceilTo(Math.max(Number.isFinite(p.nm) ? p.nm : 0, 50) * 1.15, 100);

  const px = (rpm: number) => plot.x + (rpm / rpmMax) * plot.w;
  const pyPs = (ps: number) => plot.y + plot.h - (ps / psMax) * plot.h;
  const pyNm = (v: number) => plot.y + plot.h - (v / nmMax) * plot.h;

  // Feines Gitter (10 Spalten je 1000 U/min, 5 Zeilen je 100 PS – jeweils 5 Unterteilungen)
  const colsMajor = rpmMax / 1000;
  const rowsMajor = psMax / 100;
  doc.setLineWidth(0.1);
  doc.setDrawColor(...COL.gridMinor);
  for (let i = 0; i <= colsMajor * 5; i++) {
    const x = plot.x + (plot.w * i) / (colsMajor * 5);
    doc.line(x, plot.y, x, plot.y + plot.h);
  }
  for (let i = 0; i <= rowsMajor * 5; i++) {
    const y = plot.y + (plot.h * i) / (rowsMajor * 5);
    doc.line(plot.x, y, plot.x + plot.w, y);
  }
  doc.setLineWidth(0.25);
  doc.setDrawColor(...COL.grid);
  for (let i = 0; i <= colsMajor; i++) {
    const x = plot.x + (plot.w * i) / colsMajor;
    doc.line(x, plot.y, x, plot.y + plot.h);
  }
  for (let i = 0; i <= rowsMajor; i++) {
    const y = plot.y + (plot.h * i) / rowsMajor;
    doc.line(plot.x, y, plot.x + plot.w, y);
  }

  // Achsen + Beschriftung
  doc.setLineWidth(0.4);
  doc.setDrawColor(...COL.axis);
  doc.rect(plot.x, plot.y, plot.w, plot.h);
  doc.setFontSize(7);
  doc.setTextColor(...COL.text);
  for (let i = 0; i <= colsMajor; i++) {
    const x = plot.x + (plot.w * i) / colsMajor;
    doc.text(String(i * 1000), x, plot.y + plot.h + 4, { align: "center" });
  }
  doc.text("n [U/min]", plot.x + plot.w, plot.y + plot.h + 8, { align: "right" });
  for (let i = 0; i <= rowsMajor; i++) {
    const y = plot.y + plot.h - (plot.h * i) / rowsMajor;
    doc.text(String(i * 100), plot.x - 2, y + 1, { align: "right" });
  }
  doc.setTextColor(...COL.torque);
  const nmRows = nmMax / 100;
  for (let i = 0; i <= nmRows; i++) {
    const y = plot.y + plot.h - (plot.h * i) / nmRows;
    doc.text(String(i * 100), plot.x + plot.w + 2, y + 1);
  }
  doc.text("M [Nm]", plot.x + plot.w + 2, plot.y - 1.5);
  doc.setTextColor(...COL.text);
  doc.text("P [PS]", plot.x - 2, plot.y - 1.5, { align: "right" });

  // Kurven
  doc.setLineWidth(0.7);
  const draw = (
    color: [number, number, number],
    val: (c: Curve) => number,
    scale: (v: number) => number,
    max: number,
  ) => {
    doc.setDrawColor(...color);
    let run: Array<[number, number]> = [];
    for (const c of curves) {
      const v = val(c);
      if (!Number.isFinite(v)) { if (run.length > 1) drawPolyline(doc, run); run = []; continue; }
      run.push([px(c.rpm), scale(Math.max(0, Math.min(v, max)))]);
    }
    if (run.length > 1) drawPolyline(doc, run);
  };
  draw(COL.torque, (c) => c.nm, pyNm, nmMax);
  draw(COL.engine, (c) => c.pEngine, pyPs, psMax);
  draw(COL.wheel, (c) => c.pWheel, pyPs, psMax);
  draw(COL.drag, (c) => c.pDrag, pyPs, psMax);

  // Legende
  const legend: Array<[string, [number, number, number]]> = [
    ["P-Rad [PS]", COL.wheel],
    ["P-Schlepp [PS]", COL.drag],
    ["P-Motor [PS]", COL.engine],
    ["M-Motor [Nm]", COL.torque],
  ];
  const lw = 34, lh = 4 + legend.length * 4;
  const lx = plot.x + 3, ly = plot.y + 3;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...COL.axis);
  doc.setLineWidth(0.2);
  doc.rect(lx, ly, lw, lh, "FD");
  doc.setFontSize(7);
  legend.forEach(([label, color], i) => {
    const y = ly + 5 + i * 4;
    doc.setDrawColor(...color);
    doc.setLineWidth(0.8);
    doc.line(lx + 2, y - 1, lx + 7, y - 1);
    doc.setTextColor(...color);
    doc.text(label, lx + 9, y);
  });
  doc.setTextColor(...COL.text);

  /* --- Datenblöcke --- */
  const tableY = plot.y + plot.h + 11;
  const colW = (W - 2 * M) / 2;
  const rowH = 4.6;

  const box = (x: number, y: number, w: number, h: number, title: string) => {
    doc.setDrawColor(...COL.axis);
    doc.setLineWidth(0.3);
    doc.rect(x, y, w, h);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text(title, x + 2, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
  };
  const kv = (x: number, y: number, w: number, label: string, sym: string, value: string) => {
    doc.text(label, x + 2, y);
    doc.text(sym, x + w * 0.44, y);
    doc.text(value, x + w - 2, y, { align: "right" });
  };

  const hLeft = 8 + rowH * 7;
  box(M, tableY, colW - 2, hLeft, "Leistungsdaten");
  let y = tableY + 10;
  const kw = (ps: number) => `${de(ps)} PS / ${de(ps * 0.7355)} kW`;
  kv(M, y, colW - 2, "Motorleistung", "P_Mot", kw(p.pEngine)); y += rowH;
  kv(M, y, colW - 2, "Radleistung", "P_Rad", kw(p.pWheel)); y += rowH;
  kv(M, y, colW - 2, "Schleppleistung", "P_Schlepp", kw(p.pDrag)); y += rowH;
  kv(M, y, colW - 2, "Max. Leistung bei", "", `${de(p.pERpm, 0)} U/min / ${de(p.pEKmh)} km/h`); y += rowH;
  kv(M, y, colW - 2, "Drehmoment", "M_Mot", `${de(p.nm)} Nm`); y += rowH;
  kv(M, y, colW - 2, "Max. Drehmoment bei", "", `${de(p.nmRpm, 0)} U/min / ${de(p.nmKmh)} km/h`); y += rowH;
  kv(M, y, colW - 2, "Max. erreichte Drehzahl", "", `${de(p.maxRpm, 0)} U/min / ${de(p.vMax)} km/h`);

  const x2 = M + colW;
  const hEnv = 8 + rowH * 3;
  box(x2, tableY, colW - 2, hEnv, "Umgebungsdaten");
  y = tableY + 10;
  kv(x2, y, colW - 2, "Umgebungs-Temperatur", "T_Umgebung", `${de(d.session.tempC)} °C`); y += rowH;
  kv(x2, y, colW - 2, "Luftdruck", "p_Luft", `${de(d.session.pressureHpa)} hPa`); y += rowH;
  kv(x2, y, colW - 2, "Relative Luftfeuchte", "H_Luft", `${de(d.session.rh)} %`);

  const hVeh = 8 + rowH * 5;
  box(x2, tableY + hEnv + 3, colW - 2, hVeh, "Fahrzeug- & Messdaten");
  y = tableY + hEnv + 13;
  const mass = d.session.massOverride && d.session.massOverride > 0 ? d.session.massOverride : d.vehicle.mass;
  const cdA = d.segment.calibration?.cdA ?? d.vehicle.cd * d.vehicle.area;
  const crr = d.segment.calibration?.crr ?? d.vehicle.crr;
  kv(x2, y, colW - 2, "Masse (inkl. Fahrer)", "m", `${de(mass, 0)} kg`); y += rowH;
  kv(x2, y, colW - 2, "Luftwiderstandsfläche", "cd·A", `${de(cdA, 3)} m²`); y += rowH;
  kv(x2, y, colW - 2, "Rollwiderstand", "Crr", `${de(crr, 4)}`); y += rowH;
  kv(x2, y, colW - 2, "Drehzahlfaktor", "n/v", `${de(d.segment.rpmFactor, 2)} U/min pro km/h`); y += rowH;
  kv(x2, y, colW - 2, "Glättungsfenster", "", `${d.vehicle.smoothingWindow} Samples`);

  /* --- Fußzeile --- */
  const fy = Math.max(tableY + hLeft, tableY + hEnv + 3 + hVeh) + 6;
  doc.setDrawColor(...COL.line);
  doc.setLineWidth(0.2);
  doc.line(M, fy - 3, W - M, fy - 3);
  doc.setFontSize(8);
  doc.text(`Fahrzeug-Typ: ${info.vehicleType || d.vehicle.name}`, M, fy);
  doc.text(`Kennzeichen: ${info.plate || "—"}`, M + 70, fy);
  doc.text(`Prüfer: ${info.tester || "—"}`, M + 130, fy);
  if (info.customer) doc.text(`Kunde: ${info.customer}`, M + 180, fy);
  doc.setFontSize(6.5);
  doc.setTextColor(90, 90, 90);
  const notes = [d.session.notes, d.segment.notes].filter(Boolean).join(" · ");
  if (notes) doc.text(doc.splitTextToSize(`Notizen: ${notes}`, W - 2 * M).slice(0, 2), M, fy + 4);
  doc.text(
    "GPS-basierte Messung (kein Rollenprüfstand). Motorleistung/-drehmoment sind Schätzungen aus Radleistung + Schleppkurve; keine Normkorrektur nach EWG 80/1269.",
    M, H - M, { maxWidth: W - 2 * M },
  );
}

export function buildRunPdf(runs: RunPdfData[], info: PdfHeaderInfo): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  runs.forEach((r, i) => {
    if (i > 0) doc.addPage();
    drawPage(doc, r, info);
  });
  return doc;
}

export function exportRunPdf(runs: RunPdfData[], info: PdfHeaderInfo) {
  if (runs.length === 0) return;
  const doc = buildRunPdf(runs, info);
  const first = runs[0];
  const safe = (s: string) => s.replace(/[^\w\-]+/g, "_");
  const name = runs.length === 1
    ? `Leistungsprotokoll_${safe(first.vehicle.name)}_${safe(first.segment.name)}.pdf`
    : `Leistungsprotokoll_${safe(first.vehicle.name)}_${runs.length}_Laeufe.pdf`;
  doc.save(name);
}
