import { Section, Field, Select, Note } from "./ui";
import { ImportTab } from "./ImportTab";
import { LiveTab } from "./LiveTab";
import type { ModuleId } from "@/lib/dragy/types";
import { MODULE_DESC, MODULE_IDS, MODULE_LABEL } from "@/lib/dragy/modules";

/** Aufnehmen: Import und Live-Aufzeichnung, immer für ein gewähltes Modul. */
export function CaptureTab({ module, onModuleChange, onOpenGarage }: {
  module: ModuleId;
  onModuleChange: (m: ModuleId) => void;
  onOpenGarage?: () => void;
}) {
  return (
    <div>
      <Section title="Aufnehmen" note="Neue Daten landen im gewählten Modul und können später umgehängt werden.">
        <Field label="Modul für neue Sessions" hint={MODULE_DESC[module]}>
          <Select value={module} onChange={(e) => onModuleChange(e.target.value as ModuleId)}>
            {MODULE_IDS.map((m) => <option key={m} value={m}>{MODULE_LABEL[m]}</option>)}
          </Select>
        </Field>
        <Note>Import: Dragy-Rohdaten (UBX) oder Tabellen (z.B. P-Gear Excel/CSV). Live: GPS-Gerät per Bluetooth.</Note>
      </Section>

      <ImportTab module={module} onOpenVehicles={onOpenGarage} />
      <LiveTab module={module} onOpenVehicles={onOpenGarage} />
    </div>
  );
}
