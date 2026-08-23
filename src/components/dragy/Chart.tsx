import { useEffect, useRef, useState } from "react";

export interface Series {
  label: string;
  color: string;
  points: Array<{ x: number; y: number }>;
  visible?: boolean;
  /** Gestrichelt zeichnen – z.B. für die unkorrigierte Vergleichskurve. */
  dashed?: boolean;
}
export interface Band { xStart: number; xEnd: number; color: string; label?: string }

interface Props {
  series: Series[];
  bands?: Band[];
  xLabel?: string;
  yLabel?: string;
  height?: number;
  onLegendToggle?: (i: number) => void;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  /** Legende ausblenden – für Diagramme mit nur einer Serie, wo sie nichts zu schalten gibt. */
  showLegend?: boolean;
}

/** Höchstens so viele Zeilen in der Cursor-Anzeige, danach nur noch ein Zähler. */
const MAX_READOUT_ROWS = 5;

/**
 * Interpolierter y-Wert einer Serie an der x-Position – eine Quelle für den
 * gezeichneten Punkt und die angezeigte Zahl. Vorher stand dieselbe Funktion
 * zweimal im Modul; laufen die auseinander, zeigt der Cursor etwas anderes an,
 * als er markiert.
 */
function interpAt(s: Series, xVal: number): number | null {
  const ps = s.points;
  for (let k = 0; k < ps.length - 1; k++) {
    const a = ps[k], b = ps[k + 1];
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
    if (xVal < lo || xVal > hi) continue;
    if (b.x === a.x) continue; // vertikaler Sprung überspringen
    const t = (xVal - a.x) / (b.x - a.x);
    return a.y + t * (b.y - a.y);
  }
  return null;
}

/** Höchster y-Wert einer Serie – die Ruheanzeige, solange kein Cursor gesetzt ist. */
function peakOf(s: Series): number | null {
  let peak = -Infinity;
  for (const p of s.points) if (Number.isFinite(p.y) && p.y > peak) peak = p.y;
  return peak > -Infinity ? peak : null;
}

export function Chart({ series, bands = [], xLabel, yLabel, height = 280, onLegendToggle, xFormat, yFormat, showLegend = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number } | null>(null);
  const [size, setSize] = useState({ w: 320, h: height });

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  const visSeries = series.filter((s) => s.visible !== false);
  const allPts = visSeries.flatMap((s) => s.points);
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const p of allPts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
  }
  if (!Number.isFinite(xMin)) { xMin = 0; xMax = 1; yMin = 0; yMax = 1; }
  if (xMin === xMax) xMax = xMin + 1;
  if (yMin === yMax) yMax = yMin + 1;
  const yPad = (yMax - yMin) * 0.08;
  yMin = Math.min(yMin, 0); yMax += yPad;

  // padB so bemessen, dass Marken (Grundlinie H-20) und Achsentitel (H-4)
  // sich nicht überlappen – vorher lagen beide 8 px auseinander und liefen ineinander.
  const padL = 44, padR = 12, padT = 10, padB = 34;
  const W = size.w, H = size.h;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const toPx = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * plotW;
  const toPy = (y: number) => padT + (1 - (y - yMin) / (yMax - yMin)) * plotH;

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr;
    c.style.width = W + "px"; c.style.height = H + "px";
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // Design-Tokens aus dem CSS lesen (kein Hardcoding von Farben)
    const cs = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    const colCard = token("--card", "#1e1e1e");
    const colBorder = token("--border", "#2f2f2f");
    const colMuted = token("--muted-foreground", "#a8a8a8");
    const colText = token("--foreground", "#ededed");
    // bg
    ctx.fillStyle = colCard;
    ctx.fillRect(0, 0, W, H);
    // bands
    for (const b of bands) {
      ctx.fillStyle = b.color + "40";
      const x1 = toPx(b.xStart), x2 = toPx(b.xEnd);
      ctx.fillRect(x1, padT, x2 - x1, plotH);
    }
    // grid
    ctx.strokeStyle = colBorder; ctx.fillStyle = colMuted; ctx.font = "13px Inter, system-ui"; ctx.lineWidth = 1;
    const nx = 5, ny = 5;
    for (let i = 0; i <= nx; i++) {
      const x = padL + (i / nx) * plotW;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
      const v = xMin + (i / nx) * (xMax - xMin);
      const txt = xFormat ? xFormat(v) : v.toFixed(1);
      // Erste Marke linksbündig, letzte rechtsbündig – sonst läuft sie über den
      // Plotrand hinaus und kollidiert mit dem Achsentitel.
      const tw = ctx.measureText(txt).width;
      ctx.fillText(txt, i === 0 ? x : i === nx ? x - tw : x - tw / 2, H - 20);
    }
    for (let i = 0; i <= ny; i++) {
      const y = padT + (i / ny) * plotH;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      const v = yMax - (i / ny) * (yMax - yMin);
      ctx.fillText(yFormat ? yFormat(v) : v.toFixed(0), 4, y + 3);
    }
    // series
    for (const s of visSeries) {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2;
      ctx.setLineDash(s.dashed ? [5, 4] : []);
      ctx.beginPath();
      let started = false;
      for (const p of s.points) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { started = false; continue; }
        const x = toPx(p.x), y = toPy(p.y);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // axis labels
    ctx.fillStyle = colText; ctx.font = "13px Inter, system-ui";
    if (xLabel) ctx.fillText(xLabel, W - padR - ctx.measureText(xLabel).width, H - 4);
    if (yLabel) { ctx.save(); ctx.translate(12, padT + 4); ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, -plotH + 4, 0); ctx.restore(); }

    // hover crosshair — interpoliert an der exakten x-Position pro Serie
    if (hover) {
      const hx = hover.x;
      ctx.strokeStyle = colMuted; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, padT + plotH); ctx.stroke();
      ctx.setLineDash([]);
      const xVal = xMin + ((hx - padL) / plotW) * (xMax - xMin);
      for (const s of visSeries) {
        const y = interpAt(s, xVal);
        if (y == null || !Number.isFinite(y)) continue;
        ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.arc(toPx(xVal), toPy(y), 4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }, [series, bands, W, H, hover, xLabel, yLabel, xMin, xMax, yMin, yMax]);

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x >= padL && x <= padL + plotW) setHover({ x });
  };
  // Bewusst kein Löschen beim Verlassen: beim Touch feuert pointerleave schon
  // beim Fingerheben, und genau dann will man die Werte lesen – der Finger hat
  // die Stelle bis dahin verdeckt. Der Cursor bleibt also stehen, bis er neu
  // gesetzt oder über das × zurückgenommen wird.

  const cursorX = hover ? xMin + ((hover.x - padL) / plotW) * (xMax - xMin) : null;
  const fmtY = (v: number) => (yFormat ? yFormat(v) : v.toFixed(1));

  // Eine Zeile je sichtbarer Serie – auch ohne Wert an dieser Stelle, damit die
  // Höhe des Panels beim Hovern konstant bleibt und der Chart nicht springt.
  const readoutRows = visSeries
    .map((s) => ({
      label: s.label,
      color: s.color,
      value: cursorX != null ? interpAt(s, cursorX) : peakOf(s),
    }))
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const leader = readoutRows[0]?.value ?? null;
  const shownRows = readoutRows.slice(0, MAX_READOUT_ROWS);
  const restCount = readoutRows.length - shownRows.length;

  return (
    <div ref={wrapRef} className="w-full">
      {readoutRows.length > 0 && (
        <div className="mb-1 rounded-md border border-border bg-elevated px-2 py-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex-none text-caption font-medium text-foreground">
              {cursorX != null
                ? `${xLabel ? `${xLabel}: ` : ""}${xFormat ? xFormat(cursorX) : cursorX.toFixed(1)}`
                : "Maximum"}
            </span>
            {/* Einheit einmal im Kopf statt in jeder Zeile – der Achsentitel kann
                lang sein ("Radleistung (PS)") und würde die Zahlen erdrücken. */}
            {yLabel && (
              <span className="min-w-0 flex-1 truncate text-right text-caption text-muted-foreground" title={yLabel}>
                {yLabel}
              </span>
            )}
            <button
              type="button"
              onClick={() => setHover(null)}
              aria-label="Cursor zurücksetzen"
              tabIndex={cursorX != null ? 0 : -1}
              aria-hidden={cursorX == null}
              className={`-my-1 flex h-8 w-8 flex-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground ${cursorX != null ? "" : "invisible"}`}
            >
              ×
            </button>
          </div>
          <div className="mt-0.5 space-y-0.5">
            {shownRows.map((r, i) => {
              // Nach Wert absteigend sortiert – der Rückstand bezieht sich immer
              // auf die an dieser Stelle führende Kurve.
              const delta = i > 0 && r.value != null && leader != null ? r.value - leader : null;
              return (
                <div key={`${r.label}-${i}`} className="flex items-center gap-2 text-caption">
                  <span className="h-2 w-3 flex-none rounded-sm" style={{ backgroundColor: r.color }} />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground" title={r.label}>{r.label}</span>
                  <span className="flex-none tabular-nums text-foreground">
                    {r.value != null ? fmtY(r.value) : "—"}
                  </span>
                  <span className="w-14 flex-none text-right tabular-nums text-muted-foreground">
                    {delta != null && Math.abs(delta) >= 0.05 ? `−${fmtY(Math.abs(delta))}` : ""}
                  </span>
                </div>
              );
            })}
            {restCount > 0 && (
              <div className="pl-5 text-caption text-muted-foreground">+{restCount} weitere</div>
            )}
          </div>
        </div>
      )}
      <canvas ref={canvasRef} onPointerMove={onMove} onPointerDown={onMove} className="touch-none rounded-md" />
      {showLegend && series.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {series.map((s, i) => (
            <button key={i} type="button" onClick={() => onLegendToggle?.(i)}
              aria-pressed={s.visible !== false}
              aria-label={`${s.label} ${s.visible === false ? "einblenden" : "ausblenden"}`}
              className={`flex min-h-[44px] items-center gap-2 rounded-md bg-elevated px-3 text-caption transition-ui hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${s.visible === false ? "opacity-40" : ""}`}>
              <span className="inline-block h-2 w-4 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="text-foreground">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
