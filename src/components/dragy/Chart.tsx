import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

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
  /**
   * Null erzwingen statt der y-Achse die Daten folgen zu lassen.
   *
   * Für Leistung und Drehmoment richtig: auf einem Prüfstandsprotokoll beginnt
   * die Achse bei null, sonst ließe sich die Größenordnung nicht mehr ablesen
   * und 3 % Unterschied sähen nach viel aus. Für Geschwindigkeit oder Coastdown
   * dagegen falsch – ein Lauf ab 60 km/h ließe die untere Hälfte leer.
   *
   * Standard true, damit eine übersehene Aufrufstelle sich wie bisher verhält.
   */
  yFromZero?: boolean;
}

/** Höchstens so viele Zeilen in der Cursor-Anzeige, danach nur noch ein Zähler. */
const MAX_READOUT_ROWS = 5;

/**
 * Runder Achsenschritt aus {1, 2, 5}·10^k. Bewusst ohne 2,5: bei ganzzahliger
 * Formatierung („6183") ergäben halbe Schritte doppelte Beschriftungen.
 */
function niceStep(range: number, target: number): number {
  if (!(range > 0) || target < 1) return 1;
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

/**
 * Achsengrenzen auf runde Vielfache erweitern und die Marken dazwischen setzen –
 * so stehen dort 2000/4000/6000 statt 2256/3565/4874. Die Grenzen richten sich
 * dabei nach den tatsächlich angezeigten Extremwerten, nur eben nach außen auf
 * den nächsten runden Wert gezogen.
 */
function niceAxis(min: number, max: number, target: number): { lo: number; hi: number; ticks: number[] } {
  const step = niceStep(max - min, target);
  const lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (hi <= lo) hi = lo + step;
  // Über den Index rechnen statt aufzuaddieren, damit sich keine Fehler
  // summieren – und auf die Stellenzahl des Schritts runden, weil auch ein
  // einzelnes Produkt daneben liegt (3 · 0,2 = 0,6000000000000001).
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const n = Math.round((hi - lo) / step);
  const ticks: number[] = [];
  for (let i = 0; i <= n; i++) ticks.push(+(lo + i * step).toFixed(decimals));
  return { lo, hi, ticks };
}

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

export function Chart({ series, bands = [], xLabel, yLabel, height = 280, onLegendToggle, xFormat, yFormat, showLegend = true, yFromZero = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number } | null>(null);
  const [size, setSize] = useState({ w: 320, h: height });
  const [fullscreen, setFullscreen] = useState(false);

  // Größe direkt vom Plot-Container lesen statt vom height-Prop abzuleiten:
  // im Vollbild füllt derselbe Container per Flexbox die verfügbare Höhe
  // (auch nach Drehen des Telefons), im Normalmodus entspricht sie exakt
  // dem height-Prop, weil der Container dort eine feste Höhe bekommt.
  useEffect(() => {
    const el = plotRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Vollbild wieder verlassen: per Escape, und Hintergrund währenddessen
  // nicht scrollen lassen – gleiches Muster wie beim PDF-Export-Dialog.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

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
  if (yFromZero) yMin = Math.min(yMin, 0);

  // padB so bemessen, dass Marken (Grundlinie H-20) und Achsentitel (H-4)
  // sich nicht überlappen – vorher lagen beide 8 px auseinander und liefen ineinander.
  // padL so breit, dass der gedrehte Achsentitel (Glyphenband bei x 2..15) und
  // die Marken (ab x 18, bis "10000" ≈ 36 px) nebeneinander passen – vorher
  // lief der Titel quer durch die Beschriftungen.
  const padL = 56, padR = 12, padT = 10, padB = 34;
  const W = size.w, H = size.h;

  // Anzahl der Marken an die verfügbare Fläche koppeln: auf dem Handy werden
  // acht Beschriftungen zur Zahlenwand, auf dem Desktop sind vier zu grob.
  // Der Zuschlag nach oben ersetzt die frühere feste 8-%-Reserve.
  const xAxis = niceAxis(xMin, xMax, W < 500 ? 4 : 7);
  const yAxis = niceAxis(yMin, yMax, H < 200 ? 3 : 6);
  xMin = xAxis.lo; xMax = xAxis.hi;
  yMin = yAxis.lo; yMax = yAxis.hi;
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
    // Doppelte Beschriftungen unterdrücken: gibt der Aufrufer einen groben
    // Formatierer (toFixed(0)) für eine kleine Spanne, hießen sonst zwei
    // benachbarte Marken gleich.
    let lastX = "";
    xAxis.ticks.forEach((v, i) => {
      const x = toPx(v);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
      const txt = xFormat ? xFormat(v) : String(v);
      if (txt === lastX) return;
      lastX = txt;
      // Erste Marke linksbündig, letzte rechtsbündig – sonst läuft sie über den
      // Plotrand hinaus und kollidiert mit dem Achsentitel.
      const tw = ctx.measureText(txt).width;
      const last = i === xAxis.ticks.length - 1;
      ctx.fillText(txt, i === 0 ? x : last ? x - tw : x - tw / 2, H - 20);
    });
    let lastY = "";
    for (const v of yAxis.ticks) {
      const y = toPy(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      const txt = yFormat ? yFormat(v) : String(v);
      if (txt === lastY) continue;
      lastY = txt;
      ctx.fillText(txt, 18, y + 3);
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

  const content = (
    <>
      {readoutRows.length > 0 && (
        <div className={`mb-1 rounded-md border border-border bg-elevated px-2 py-1.5 ${fullscreen ? "shrink-0" : ""}`}>
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
              onClick={() => setFullscreen((f) => !f)}
              aria-label={fullscreen ? "Vollbild schließen" : "Diagramm im Vollbild anzeigen"}
              className="-my-1 flex h-8 w-8 flex-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
            </button>
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
          {/* Im Querformat ist der Bildschirm nur ~390 px hoch – fünf Wertezeilen
              plus Kopf belegen davon schon fast die Hälfte. Deshalb auch hier
              deckeln statt das Diagramm zusammenzudrücken. */}
          <div className={`mt-0.5 space-y-0.5 ${fullscreen ? "max-h-[18vh] overflow-y-auto" : ""}`}>
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
      <div ref={plotRef} className={fullscreen ? "w-full min-h-0 flex-1" : "w-full"} style={fullscreen ? undefined : { height }}>
        <canvas ref={canvasRef} onPointerMove={onMove} onPointerDown={onMove} className="h-full w-full touch-none rounded-md" />
      </div>
      {/* Im Vollbild ohne Legende: sie kostet dort nur Höhe, die dem Diagramm
          fehlt (bei vielen Läufen eine Zeile pro Lauf). Zuordnen lässt sich
          jede Kurve weiterhin über das Werte-Panel oben, das dieselben
          Farbchips und Namen zeigt; ein-/ausblenden über die Legende in der
          Normalansicht, bevor man das Vollbild öffnet. */}
      {showLegend && !fullscreen && series.length > 0 && (
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
    </>
  );

  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-background p-3"
        style={{
          paddingTop: "calc(0.75rem + env(safe-area-inset-top))",
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Diagramm, Vollbild"
      >
        {content}
      </div>
    );
  }

  return <div className="w-full">{content}</div>;
}
