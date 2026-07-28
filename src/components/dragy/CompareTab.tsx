import { useMemo, useState } from "react";
import { Section, Note } from "./ui";
import { useAppStore } from "@/lib/dragy/store";
import { computeSegment, W_TO_PS } from "@/lib/dragy/physics";
import { resolveAllGears, normalizeDrive } from "@/lib/dragy/gear";
import { Chart, type Series } from "./Chart";

type Mode = "pWheel" | "pEngine" | "tqWheel" | "tqEngine" | "accel" | "shift";
const MODE_LABEL: Record<Mode, string> = {
  pWheel: "Radleistung (PS)",
  pEngine: "Motorleistung geschätzt (PS)",
  tqWheel: "Rad-Drehmoment (Nm)",
  tqEngine: "Motor-Drehmoment geschätzt (Nm)",
  accel: "Beschleunigung (km/h vs. s)",
  shift: "Schaltdiagramm (km/h vs. U/min)",
};

const SPLIT_TARGETS = [60, 100, 150, 200];

export function CompareTab() {
  const { state, saveSegment } = useAppStore();
  const activeVehicle = state.vehicles.find((v) => v.id === state.activeVehicleId);
  const [mode, setMode] = useState<Mode>("pWheel");

  const { setups: allSetups } = useMemo(() => normalizeDrive(activeVehicle), [activeVehicle]);
  const [selectedSetupIds, setSelectedSetupIds] = useState<string[] | null>(null);
  const effectiveSelected = selectedSetupIds ?? allSetups.map((s) => s.id);

  const segments = useMemo(() => {
    if (!activeVehicle) return [];
    const own = state.sessions.filter((s) => s.vehicleId === activeVehicle.id);
    return state.segments.filter((g) => own.some((s) => s.id === g.sessionId));
  }, [state, activeVehicle]);

  if (!activeVehicle) return <Section title="Leistungsvergleich"><Note>Kein aktives Fahrzeug.</Note></Section>;

  const isAccel = mode === "accel";
  const isShift = mode === "shift";

  const series: Series[] = segments.map((g) => {
    const session = state.sessions.find((s) => s.id === g.sessionId)!;
    if (isAccel) {
      // Zeit-vs-Geschwindigkeit direkt aus Session-Rohdaten im Segmentbereich,
      // gangübergreifend (keine RPM/Drag-Kurven-Annahmen nötig).
      const points = session.records
        .filter((r) => r.t >= g.startT && r.t <= g.endT)
        .map((r) => ({ x: r.t - g.startT, y: r.speedKmh }));
      return { label: `${session.name} · ${g.name}`, color: g.color, points, visible: g.visible };
    }
    const samples = computeSegment(session, g, activeVehicle);
    const points = samples
      .map((s) => {
        let y: number = NaN;
        if (mode === "pWheel") y = s.pWheelW * W_TO_PS;
        else if (mode === "pEngine") y = s.pEngineW * W_TO_PS;
        else if (mode === "tqWheel") y = s.torqueWheelNm;
        else y = s.torqueEngineNm;
        return { x: s.rpm, y };
      })
      .filter((p) => Number.isFinite(p.y));
    return { label: `${session.name} · ${g.name}`, color: g.color, points, visible: g.visible };
  });

  // Schaltdiagramm-Serien: pro Setup × Gang eine Linie km/h(rpm) = rpm / rpmFactor.
  const shiftSeries: Series[] = useMemo(() => {
    if (!isShift) return [];
    const resolved = resolveAllGears(activeVehicle).filter((r) => effectiveSelected.includes(r.setupId));
    const maxRpm = activeVehicle.maxRpm && activeVehicle.maxRpm > 0 ? activeVehicle.maxRpm : 8000;
    const setupIds = Array.from(new Set(resolved.map((r) => r.setupId)));
    // Farb-Basis pro Setup, Sättigung nach Gang-Index für Unterscheidbarkeit.
    const baseColors = ["#38bdf8", "#f472b6", "#a3e635", "#fbbf24", "#c084fc", "#f97316"];
    const gearsBySetup = new Map<string, string[]>();
    return resolved.map((r) => {
      const setupIdx = setupIds.indexOf(r.setupId);
      const list = gearsBySetup.get(r.setupId) ?? [];
      const gearIdx = list.length;
      list.push(r.gear.id); gearsBySetup.set(r.setupId, list);
      const color = shadeColor(baseColors[setupIdx % baseColors.length], gearIdx * 0.12 - 0.24);
      const points = [
        { x: 0, y: 0 },
        { x: maxRpm, y: maxRpm / r.rpmFactor },
      ];
      return { label: `${r.setupName} · ${r.gear.name}`, color, points, visible: true };
    });
  }, [isShift, activeVehicle, effectiveSelected]);

  const shiftBands = useMemo(() => {
    if (!isShift) return [];
    const bands: Array<{ xStart: number; xEnd: number; color: string; label?: string }> = [];
    if (activeVehicle.shiftRpm) bands.push({ xStart: activeVehicle.shiftRpm - 25, xEnd: activeVehicle.shiftRpm + 25, color: "#f59e0b", label: "Schaltdrehzahl" });
    if (activeVehicle.maxRpm) bands.push({ xStart: activeVehicle.maxRpm - 25, xEnd: activeVehicle.maxRpm + 25, color: "#ef4444", label: "Max" });
    return bands;
  }, [isShift, activeVehicle]);


  const toggle = async (i: number) => {
    const g = segments[i]; if (!g) return;
    await saveSegment({ ...g, visible: !g.visible });
  };

  // Split-Zeiten (nur im Beschleunigungs-Modus): lineare Interpolation an Zielgeschwindigkeit.
  const splitRows = isAccel
    ? segments
        .filter((g) => g.visible !== false)
        .map((g) => {
          const session = state.sessions.find((s) => s.id === g.sessionId)!;
          const rec = session.records.filter((r) => r.t >= g.startT && r.t <= g.endT);
          const t0 = rec[0]?.t ?? g.startT;
          const splits: Record<number, number | null> = {};
          for (const target of SPLIT_TARGETS) {
            let found: number | null = null;
            for (let i = 1; i < rec.length; i++) {
              const a = rec[i - 1], b = rec[i];
              if (a.speedKmh <= target && b.speedKmh >= target && b.speedKmh !== a.speedKmh) {
                const frac = (target - a.speedKmh) / (b.speedKmh - a.speedKmh);
                found = (a.t + frac * (b.t - a.t)) - t0;
                break;
              }
            }
            splits[target] = found;
          }
          return { label: `${session.name} · ${g.name}`, color: g.color, splits };
        })
    : [];

  return (
    <div>
      <Section
        title="Vergleich"
        note={
          isAccel
            ? "Beschleunigung: rein GPS-basiert, gangübergreifend – zeigt reale Zeit ab Segmentstart bis zur jeweiligen Geschwindigkeit."
            : isShift
              ? "Schaltdiagramm: km/h(rpm) je Setup und Gang aus Getriebe- und Endübersetzung sowie Reifenumfang berechnet. Bänder markieren Schalt- und Maximaldrehzahl."
              : "Motorleistung/-drehmoment sind Schätzungen (RPM aus Vmax abgeleitet, Schleppkurve als Näherung). Drehmoment ist gegenüber RPM-Faktor-Fehlern empfindlicher als die Leistung."
        }
      >
        <div className="mb-2 flex flex-wrap gap-1">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`rounded px-2 py-1 text-xs ${mode === m ? "bg-sky-500 text-white" : "bg-slate-700 text-slate-200"}`}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>

        {isShift ? (
          allSetups.length === 0 ? (
            <p className="text-xs text-slate-400">Keine Setups am aktiven Fahrzeug – erst Getriebe, Endübersetzung und Setup anlegen.</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-2 text-xs text-slate-200">
                {allSetups.map((s) => {
                  const on = effectiveSelected.includes(s.id);
                  return (
                    <label key={s.id} className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => {
                          const base = effectiveSelected;
                          const next = e.target.checked ? Array.from(new Set([...base, s.id])) : base.filter((x) => x !== s.id);
                          setSelectedSetupIds(next);
                        }}
                      />
                      {s.name}
                    </label>
                  );
                })}
              </div>
              <Chart
                series={shiftSeries}
                bands={shiftBands}
                xLabel="U/min"
                yLabel="km/h"
                xFormat={(v) => v.toFixed(0)}
                yFormat={(v) => v.toFixed(0)}
                height={340}
              />
            </>
          )
        ) : segments.length === 0 ? (
          <p className="text-xs text-slate-400">Keine Läufe im aktiven Fahrzeug.</p>
        ) : (
          <>
            <Chart
              series={series}
              xLabel={isAccel ? "t (s)" : "U/min"}
              yLabel={isAccel ? "km/h" : MODE_LABEL[mode]}
              xFormat={(v) => (isAccel ? v.toFixed(2) : v.toFixed(0))}
              yFormat={(v) => v.toFixed(0)}
              onLegendToggle={toggle}
              height={340}
            />
            {isAccel && splitRows.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs text-slate-200">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="py-1 pr-2 text-left font-medium">Lauf</th>
                      {SPLIT_TARGETS.map((t) => (
                        <th key={t} className="py-1 pr-2 text-right font-medium">0–{t} km/h</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {splitRows.map((r, i) => (
                      <tr key={i} className="border-t border-slate-800">
                        <td className="py-1 pr-2">
                          <span className="mr-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ backgroundColor: r.color }} />
                          {r.label}
                        </td>
                        {SPLIT_TARGETS.map((t) => (
                          <td key={t} className="py-1 pr-2 text-right tabular-nums">
                            {r.splits[t] != null ? `${r.splits[t]!.toFixed(2)} s` : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-[10px] text-slate-500">Split-Zeiten linear zwischen Samples interpoliert; „—" wenn die Zielgeschwindigkeit im Segment nicht erreicht wurde.</p>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Grenzen & Annahmen der Berechnung">
        <ul className="list-disc space-y-1 pl-4 text-xs text-slate-300">
          <li>
            <b>Rotierende Massen werden nicht berücksichtigt.</b> Im Beschleunigungsterm geht nur die
            translatorische Fahrzeugmasse ein; Räder, Antriebsstrang und Motor-Trägheit sind ausgeklammert.
            Die berechnete Rad-/Motorleistung liegt dadurch systematisch etwas zu niedrig, besonders in
            niedrigen Gängen.
          </li>
          <li>
            <b>Antriebsstrangverluste unter Last ≠ Schleppleistung.</b> Die eingegebene Schleppkurve
            (Prüfstand, unbelastet) wird zur Motorleistungsschätzung addiert. Unter Volllast sind die
            realen Verluste höher; die Motorleistungswerte sind daher eine Näherung, keine echte
            Prüfstands-Messung.
          </li>
          <li>
            <b>RPM aus Geschwindigkeit abgeleitet.</b> Es gibt keinen Drehzahlsensor – die U/min-Achse
            wird über den Vmax-Faktor pro Lauf hochgerechnet. Bei Schaltvorgängen, Kupplungsschlupf oder
            falsch gesetztem Faktor verzerrt das die x-Achse; Drehmoment-Kurven reagieren darauf
            empfindlicher als Leistungs-Kurven.
          </li>
          <li>
            <b>Auto-Erkennung der Pulls ist heuristisch.</b> Die Segment-Suche basiert nur auf
            GPS-Geschwindigkeit, ohne Gaspedal- oder Ruck-Signal. Unvollständige Zwischen-Pulls,
            Rollen-Lassen oder Schaltpausen können fälschlich als Lauf erkannt oder abgeschnitten werden –
            Segmentgrenzen ggf. manuell korrigieren.
          </li>
          <li>
            <b>Coastdown-Kalibrierung setzt saubere Bedingungen voraus:</b> ausgekuppelt, ebene Strecke,
            kein Wind. Bei R² &lt; 0.85 wird gewarnt, aber auch hohe R² garantieren keine physikalisch
            korrekten Cd·A/Crr-Werte – nur eine gute Anpassung an den gewählten Abschnitt.
          </li>
          <li>
            <b>Luftdichte</b> aus Temperatur, Druck und Luftfeuchte je Session. Werden diese nicht
            gepflegt, weichen die Leistungswerte entsprechend ab.
          </li>
        </ul>
      </Section>
    </div>
  );

}

// Hex-Farbe um einen Faktor aufhellen/abdunkeln (−1..+1).
function shadeColor(hex: string, amount: number): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return hex;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const adj = (c: number) => {
    const t = amount < 0 ? 0 : 255;
    const p = Math.abs(amount);
    return Math.round((t - c) * p + c);
  };
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${toHex(adj(r))}${toHex(adj(g))}${toHex(adj(b))}`;
}
