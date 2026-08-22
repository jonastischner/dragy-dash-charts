import { Field, Select } from "./ui";
import { useCorrectionStandard } from "./useCorrection";
import {
  CORRECTION_LABEL,
  CORRECTION_REFERENCE,
  type CorrectionStandard,
} from "@/lib/dragy/correction";

/**
 * Kompakte Norm-Auswahl für die Stellen, an denen man die Zahlen ansieht –
 * Auswertung und PDF-Dialog. Schreibt denselben persistierten Schlüssel wie die
 * ausführliche Sektion unter „Mehr": eine Einstellung, mehrere Bedienorte, nicht
 * zwei konkurrierende Zustände.
 */
export function CorrectionSelect({
  label = "Normkorrektur (experimentell)",
  showReference = true,
}: {
  label?: string;
  showReference?: boolean;
}) {
  const [standard, setStandard] = useCorrectionStandard();
  return (
    <div>
      <Field label={label}>
        <Select
          value={standard}
          onChange={(e) => setStandard(e.target.value as CorrectionStandard)}
        >
          {(Object.keys(CORRECTION_LABEL) as CorrectionStandard[]).map((s) => (
            <option key={s} value={s}>
              {CORRECTION_LABEL[s]}
            </option>
          ))}
        </Select>
      </Field>
      {showReference && standard !== "none" && (
        <p className="mt-1 text-caption text-muted-foreground">{CORRECTION_REFERENCE[standard]}</p>
      )}
    </div>
  );
}
