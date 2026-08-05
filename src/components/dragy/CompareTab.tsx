import { useMemo, useState } from "react";
import { Section, Note, EmptyState } from "./ui";
import { useAppStore } from "@/lib/dragy/store";
import { computeSegment, W_TO_PS } from "@/lib/dragy/physics";
import { Chart, type Series } from "./Chart";

type Mode = "pWheel" | "pEngine" | "tqWheel" | "tqEngine" | "accel";
const MODE_LABEL: Record<Mode, string> = {
  pWheel: "Radleistung (PS)",
  pEngine: "Motorleistung geschätzt (PS)",
  tqWheel: "Rad-Drehmoment (Nm)",
  tqEngine: "Motor-Drehmoment geschätzt (Nm)",
  accel: "Beschleunigung (km/h vs. s)",
};

const SPLIT_TARGETS = [60, 100, 150, 200];

export function CompareTab({ onOpenVehicles }: { onOpenVehicles?: () => void } = {}) {
  const { state, saveSegment } = useAppStore();
  const activeVehicle = state.vehicles.find((v) => v.id === state.activeVehicleId);
  const [mode, setMode] = useState<Mode>("pWheel");

  const segments = useMemo(() => {
    if (!activeVehicle) return [];
    const own = state.sessions.filter((s) => s.vehicleId === activeVehicle.id);
    return state.segments.filter((g) => own.some((s) => s.id === g.sessionId));
  }, [state, activeVehicle]);

  if (!activeVehicle) return <Section title="Leistungsvergleich"><EmptyState title="Kein aktives Fahrzeug" description="Wähle ein Fahrzeug, um Läufe zu vergleichen." actionLabel="Zu Fahrzeuge" onAction={onOpenVehicles} /></Section>;


  const isAccel = mode === "accel";

  const series: Series[] = segments.map((g) => {
    const session = state.sessions.find((s) => s.id === g.sessionId)!;
    if (isAccel) {
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

  // Übersicht: alle aktiven (sichtbaren) Läufe mit Peak-Resultaten.
  const overviewRows = segments
    .filter((g) => g.visible !== false)
    .map((g) => {
      const session = state.sessions.find((s) => s.id === g.sessionId)!;
      const samples = computeSegment(session, g, activeVehicle);
      const rec = session.records.filter((r) => r.t >= g.startT && r.t <= g.endT);
      let pW = 0, pWRpm = NaN, pE = 0, pERpm = NaN, tW = 0, tWRpm = NaN, tE = 0, tERpm = NaN;
      for (const s of samples) {
        const psW = s.pWheelW * W_TO_PS, psE = s.pEngineW * W_TO_PS;
        if (Number.isFinite(psW) && psW > pW) { pW = psW; pWRpm = s.rpm; }
        if (Number.isFinite(psE) && psE > pE) { pE = psE; pERpm = s.rpm; }
        if (Number.isFinite(s.torqueWheelNm) && s.torqueWheelNm > tW) { tW = s.torqueWheelNm; tWRpm = s.rpm; }
        if (Number.isFinite(s.torqueEngineNm) && s.torqueEngineNm > tE) { tE = s.torqueEngineNm; tERpm = s.rpm; }
      }
      const vFrom = rec[0]?.speedKmh ?? NaN;
      const vMax = rec.length ? Math.max(...rec.map((r) => r.speedKmh)) : NaN;
      const dur = rec.length ? rec[rec.length - 1].t - rec[0].t : NaN;
      return { label: `${session.name} · ${g.name}`, color: g.color, pW, pWRpm, pE, pERpm, tW, tWRpm, tE, tERpm, vFrom, vMax, dur };
    });

  const fmt = (v: number, d = 0) => (Number.isFinite(v) && v !== 0 ? v.toFixed(d) : "—");
  const fmtRpm = (v: number) => (Number.isFinite(v) ? `${v.toFixed(0)} U/min` : "—");

  return (
    <div>
      <Section
        title="Vergleich"
        note={
          isAccel
            ? "Beschleunigung: rein GPS-basiert, gangübergreifend – zeigt reale Zeit ab Segmentstart bis zur jeweiligen Geschwindigkeit."
            : "Motorleistung/-drehmoment sind Schätzungen (RPM aus Vmax abgeleitet, Schleppkurve als Näherung). Drehmoment ist gegenüber RPM-Faktor-Fehlern empfindlicher als die Leistung."
        }
      >
        <div className="mb-2 flex flex-wrap gap-2">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`rounded px-3 py-1 text-caption ${mode === m ? "bg-primary text-white" : "bg-secondary text-foreground"}`}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>

        {segments.length === 0 ? (
          <p className="text-caption text-muted-foreground">Keine Läufe im aktiven Fahrzeug.</p>
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
                <table className="w-full text-caption text-foreground">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2 text-left font-medium">Lauf</th>
                      {SPLIT_TARGETS.map((t) => (
                        <th key={t} className="py-1 pr-2 text-right font-medium">0–{t} km/h</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {splitRows.map((r, i) => (
                      <tr key={i} className="border-t border-border">
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
                <p className="mt-1 text-caption text-muted-foreground">Split-Zeiten linear zwischen Samples interpoliert; „—" wenn die Zielgeschwindigkeit im Segment nicht erreicht wurde.</p>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Übersicht aktive Läufe" note="Peak-Werte je sichtbarem Lauf – Sichtbarkeit über die Chart-Legende steuern.">
        {overviewRows.length === 0 ? (
          <p className="text-caption text-muted-foreground">Keine aktiven Läufe.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-caption text-foreground">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 text-left font-medium">Lauf</th>
                  <th className="py-1 pr-2 text-right font-medium">Rad PS</th>
                  <th className="py-1 pr-2 text-right font-medium">@ Rad</th>
                  <th className="py-1 pr-2 text-right font-medium">Motor PS</th>
                  <th className="py-1 pr-2 text-right font-medium">@ Motor</th>
                  <th className="py-1 pr-2 text-right font-medium">Rad Nm</th>
                  <th className="py-1 pr-2 text-right font-medium">@ Nm</th>
                  <th className="py-1 pr-2 text-right font-medium">Motor Nm</th>
                  <th className="py-1 pr-2 text-right font-medium">@ Nm</th>
                  <th className="py-1 pr-2 text-right font-medium">km/h</th>
                  <th className="py-1 pr-2 text-right font-medium">Dauer</th>
                </tr>
              </thead>
              <tbody>
                {overviewRows.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1 pr-2 whitespace-nowrap">
                      <span className="mr-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ backgroundColor: r.color }} />
                      {r.label}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">{fmt(r.pW)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{fmtRpm(r.pWRpm)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{fmt(r.pE)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{fmtRpm(r.pERpm)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{fmt(r.tW)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{fmtRpm(r.tWRpm)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{fmt(r.tE)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{fmtRpm(r.tERpm)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.vFrom) ? `${r.vFrom.toFixed(0)}–${r.vMax.toFixed(0)}` : "—"}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{Number.isFinite(r.dur) ? `${r.dur.toFixed(2)} s` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>


      <Section title="Grenzen & Annahmen der Berechnung">
        <ul className="list-disc space-y-1 pl-4 text-caption text-muted-foreground">
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
