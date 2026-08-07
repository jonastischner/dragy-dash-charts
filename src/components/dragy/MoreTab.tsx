import { useState } from "react";
import { Section, Button, Note } from "./ui";
import { useAppStore } from "@/lib/dragy/store";
import { BackupTab } from "./BackupTab";
import { AccountTab } from "./AccountTab";

export function MoreTab() {
  return (
    <div>
      <AccountTab />
      <ColorsSection />
      <BackupTab />

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
            realen Verluste höher; die Motorleistungswerte sind eine Näherung, keine Prüfstands-Messung.
          </li>
          <li>
            <b>RPM aus Geschwindigkeit abgeleitet.</b> Es gibt keinen Drehzahlsensor – die U/min-Achse
            wird über Getriebe/Endübersetzung/Reifen bzw. den rpmFactor pro Lauf hochgerechnet. Bei
            Kupplungsschlupf oder falschem Faktor verzerrt das die x-Achse; Drehmoment-Kurven reagieren
            darauf empfindlicher als Leistungs-Kurven.
          </li>
          <li>
            <b>Auto-Erkennung der Läufe ist heuristisch</b> und basiert nur auf GPS-Geschwindigkeit.
            Segmentgrenzen ggf. manuell korrigieren.
          </li>
          <li>
            <b>Coastdown setzt saubere Bedingungen voraus:</b> ausgekuppelt, ebene Strecke, kein Wind.
            Bei R² &lt; 0.85 wird gewarnt; auch hohe R² garantieren keine physikalisch korrekten
            Cd·A/Crr-Werte.
          </li>
          <li>
            <b>Rallye/Rundstrecke:</b> Distanzen werden aus der GPS-Geschwindigkeit integriert, es gibt
            keine Streckenreferenz oder Sektoren – Vergleiche sind nur innerhalb derselben Strecke sinnvoll.
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

function ColorsSection() {
  const { state, recolorSegments } = useAppStore();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeVehicle = state.vehicles.find((v) => v.id === state.activeVehicleId);
  const total = state.segments.length;

  const run = async (opts: { vehicleId?: string | null; onlyUnassigned?: boolean }) => {
    setBusy(true);
    try {
      const res = await recolorSegments(opts);
      setMsg(`${res.changed} von ${res.total} Läufen neu eingefärbt.`);
    } finally { setBusy(false); }
  };

  return (
    <Section title="Farben der Läufe" note={`${total} Läufe insgesamt`}>
      <p className="text-caption text-muted-foreground">
        Weist Läufen möglichst unterschiedliche Farben aus der Palette zu. Neue Läufe erhalten
        automatisch eine noch freie Farbe.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => run({ onlyUnassigned: true })} disabled={busy || total === 0}>
          Nur Doppelungen auffrischen
        </Button>
        <Button variant="secondary" onClick={() => { if (confirm("Allen Läufen neue Farben zuweisen? Eigene Farbwahl wird überschrieben.")) run({}); }} disabled={busy || total === 0}>
          Alle Läufe neu einfärben
        </Button>
        {activeVehicle && (
          <Button variant="secondary" onClick={() => { if (confirm(`Läufe von "${activeVehicle.name}" neu einfärben?`)) run({ vehicleId: activeVehicle.id }); }} disabled={busy}>
            Nur „{activeVehicle.name}“
          </Button>
        )}
      </div>
      {msg && <Note className="mt-2">{msg}</Note>}
    </Section>
  );
}
