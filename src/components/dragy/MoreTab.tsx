import { useState } from "react";
import { Section, Button, Note, Field, Select } from "./ui";
import { useAppStore } from "@/lib/dragy/store";
import { BackupTab } from "./BackupTab";
import { AccountTab } from "./AccountTab";
import { useCorrectionStandard } from "./useCorrection";
import { CORRECTION_LABEL, CORRECTION_REFERENCE, type CorrectionStandard } from "@/lib/dragy/correction";
import { STD_ENV } from "@/lib/dragy/physics";

export function MoreTab() {
  return (
    <div>
      <AccountTab />
      <ColorsSection />
      <CorrectionSection />
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
          <li>
            <b>Normkorrektur ist optional und experimentell.</b> Standardmäßig zeigt die App die aus
            der Messung berechneten Werte. Wird eine Norm aktiviert, korrigiert sie nur den Einfluss
            der Luftdichte auf die Motorabgabe – die größeren systematischen Fehler oben (rotierende
            Massen, Antriebsstrangverluste) bleiben davon unberührt.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function CorrectionSection() {
  const [standard, setStandard] = useCorrectionStandard();
  return (
    <Section title="Experimentell: Normkorrektur">
      <Note>
        Rechnet die geschätzte <b>Motor</b>leistung auf genormte Umgebungsbedingungen um, damit Läufe
        bei unterschiedlichem Wetter vergleichbar werden. Die Radleistung bleibt Messwert. Grundlage
        sind Temperatur, Luftdruck und Luftfeuchte der jeweiligen Session.
      </Note>
      <div className="mt-2">
        <Field label="Norm">
          <Select value={standard} onChange={(e) => setStandard(e.target.value as CorrectionStandard)}>
            {(Object.keys(CORRECTION_LABEL) as CorrectionStandard[]).map((s) => (
              <option key={s} value={s}>{CORRECTION_LABEL[s]}</option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="mt-2 text-caption text-muted-foreground">{CORRECTION_REFERENCE[standard]}</p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-caption text-muted-foreground">
        <li>
          <b>Nur Ottomotoren.</b> Die Diesel-Variante der EWG braucht den Kraftstoffdurchsatz, der
          sich aus GPS-Daten nicht bestimmen lässt – sie wird deshalb nicht angeboten.
        </li>
        <li>
          <b>Ersetzt keine Prüfstandsmessung.</b> Der Faktor normiert nur die Umgebungsbedingungen;
          die zugrunde liegende Leistungsschätzung wird dadurch nicht genauer.
        </li>
        <li>
          <b>Beschleunigungsprognose und PDF-Export bleiben unkorrigiert</b> – die Prognose würde
          sonst die Beschleunigung unter Referenzbedingungen statt unter den realen vorhersagen.
        </li>
        <li>
          <b>Ohne hinterlegte Umgebungsdaten wird nicht korrigiert.</b> Für die Luftdichte rechnet
          die App dann mit Standardwerten ({STD_ENV.tempC} °C / {STD_ENV.pressureHpa} hPa /{" "}
          {STD_ENV.rh} % rF), ein Normfaktor wäre daraus aber frei erfunden. Solche Läufe zeigen
          weiter ihren Messwert.
        </li>
      </ul>
      <LegacyEnvCleanup />
    </Section>
  );
}

/**
 * Vor der Umstellung auf optionale Umgebungsfelder hat der Import fest
 * 20 °C / 1013 hPa / 50 % rF eingetragen. Diese Werte sind von echten Eingaben
 * nicht zu unterscheiden, deshalb wird nichts automatisch geändert – nur auf
 * ausdrückliche Bestätigung hin.
 */
function LegacyEnvCleanup() {
  const { state, saveSession } = useAppStore();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const candidates = state.sessions.filter(
    (s) => s.tempC === STD_ENV.tempC && s.pressureHpa === STD_ENV.pressureHpa && s.rh === STD_ENV.rh,
  );
  if (candidates.length === 0 && !msg) return null;

  const run = async () => {
    setBusy(true);
    try {
      const list = [...candidates];
      for (const s of list) {
        await saveSession({ ...s, tempC: undefined, pressureHpa: undefined, rh: undefined });
      }
      setMsg(`${list.length} Session(s) geleert – sie werden ab jetzt nicht mehr korrigiert.`);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-caption text-muted-foreground">
        <b className="text-foreground">{candidates.length} Session(s)</b> tragen exakt die alten
        Import-Vorgaben {STD_ENV.tempC} °C / {STD_ENV.pressureHpa} hPa / {STD_ENV.rh} % rF. Ob das
        gemessen oder nur voreingestellt war, lässt sich nicht mehr feststellen – deshalb werden sie
        wie eingetragene Werte behandelt und korrigiert. Wurden sie nie gemessen, lassen sich die
        Felder hier leeren.
      </p>
      {msg && <Note>{msg}</Note>}
      <div className="mt-2 flex flex-wrap gap-2">
        {confirm ? (
          <>
            <Button onClick={run} disabled={busy}>
              {busy ? "Leere …" : `Ja, ${candidates.length} Session(s) leeren`}
            </Button>
            <Button variant="secondary" onClick={() => setConfirm(false)} disabled={busy}>Abbrechen</Button>
          </>
        ) : (
          <Button onClick={() => setConfirm(true)} disabled={candidates.length === 0}>
            Umgebungsdaten dieser Sessions leeren
          </Button>
        )}
      </div>
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
      {msg && <div className="mt-2"><Note>{msg}</Note></div>}
    </Section>
  );
}
