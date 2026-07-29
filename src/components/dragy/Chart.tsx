import { useEffect, useRef, useState } from "react";

export interface Series {
  label: string;
  color: string;
  points: Array<{ x: number; y: number }>;
  visible?: boolean;
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
}

export function Chart({ series, bands = [], xLabel, yLabel, height = 280, onLegendToggle, xFormat, yFormat }: Props) {
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

  const padL = 44, padR = 12, padT = 10, padB = 30;
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
    // bg
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, W, H);
    // bands
    for (const b of bands) {
      ctx.fillStyle = b.color + "40";
      const x1 = toPx(b.xStart), x2 = toPx(b.xEnd);
      ctx.fillRect(x1, padT, x2 - x1, plotH);
    }
    // grid
    ctx.strokeStyle = "#1e293b"; ctx.fillStyle = "#94a3b8"; ctx.font = "10px system-ui"; ctx.lineWidth = 1;
    const nx = 5, ny = 5;
    for (let i = 0; i <= nx; i++) {
      const x = padL + (i / nx) * plotW;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
      const v = xMin + (i / nx) * (xMax - xMin);
      ctx.fillText(xFormat ? xFormat(v) : v.toFixed(1), x - 12, H - 10);
    }
    for (let i = 0; i <= ny; i++) {
      const y = padT + (i / ny) * plotH;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      const v = yMax - (i / ny) * (yMax - yMin);
      ctx.fillText(yFormat ? yFormat(v) : v.toFixed(0), 4, y + 3);
    }
    // series
    for (const s of visSeries) {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.beginPath();
      let started = false;
      for (const p of s.points) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { started = false; continue; }
        const x = toPx(p.x), y = toPy(p.y);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // axis labels
    ctx.fillStyle = "#cbd5e1"; ctx.font = "11px system-ui";
    if (xLabel) ctx.fillText(xLabel, W - padR - ctx.measureText(xLabel).width, H - 2);
    if (yLabel) { ctx.save(); ctx.translate(12, padT + 4); ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, -plotH + 4, 0); ctx.restore(); }

    // hover crosshair — interpoliere y an der exakten x-Position pro Serie
    const interpAt = (s: Series, xVal: number): number | null => {
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
    };
    if (hover) {
      const hx = hover.x;
      ctx.strokeStyle = "#64748b"; ctx.setLineDash([4, 4]);
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
  const onLeave = () => setHover(null);

  // hover text — gleiche Interpolation
  const interpAtOuter = (s: Series, xVal: number): number | null => {
    const ps = s.points;
    for (let k = 0; k < ps.length - 1; k++) {
      const a = ps[k], b = ps[k + 1];
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
      const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
      if (xVal < lo || xVal > hi) continue;
      if (b.x === a.x) continue;
      const t = (xVal - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
    return null;
  };
  let hoverText = "";
  if (hover) {
    const xVal = xMin + ((hover.x - padL) / plotW) * (xMax - xMin);
    const parts = [xLabel ? `${xLabel}: ${xFormat ? xFormat(xVal) : xVal.toFixed(1)}` : (xFormat ? xFormat(xVal) : xVal.toFixed(1))];
    for (const s of visSeries) {
      const y = interpAtOuter(s, xVal);
      if (y != null && Number.isFinite(y)) parts.push(`${s.label}: ${yFormat ? yFormat(y) : y.toFixed(1)}`);
    }
    hoverText = parts.join(" · ");
  }

  return (
    <div ref={wrapRef} className="w-full">
      <canvas ref={canvasRef} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={onLeave} className="touch-none rounded-md" />
      <div className="mt-1 min-h-[1.25rem] text-xs text-slate-300">{hoverText}</div>
      {series.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {series.map((s, i) => (
            <button key={i} onClick={() => onLegendToggle?.(i)}
              className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${s.visible === false ? "opacity-40" : ""}`}
              style={{ backgroundColor: "#1e293b" }}>
              <span className="inline-block h-2 w-4 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="text-slate-200">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
