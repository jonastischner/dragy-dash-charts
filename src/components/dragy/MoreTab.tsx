import { Section } from "./ui";
import { BackupTab } from "./BackupTab";
import { AccountTab } from "./AccountTab";

export function MoreTab() {
  return (
    <div>
      <AccountTab />
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
