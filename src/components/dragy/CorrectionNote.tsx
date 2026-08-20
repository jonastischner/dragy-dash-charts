import { Note } from "./ui";
import {
  CORRECTION_LABEL,
  EWG_ALPHA_MAX,
  EWG_ALPHA_MIN,
  formatCorrection,
  type CorrectionResult,
  type CorrectionStandard,
} from "@/lib/dragy/correction";

/** „a", „a und b", „a, b und c" */
function listDe(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} und ${items[items.length - 1]}`;
}

const REQUIRED_LABELS: Record<CorrectionStandard, string> = {
  none: "keine Angaben",
  din70020: "Temperatur und Luftdruck",
  ewg80_1269: "Temperatur, Luftdruck und Luftfeuchte",
};

// Hinweis, dass gerade normkorrigierte statt gemessene Werte angezeigt werden.
// Bewusst überall dort eingeblendet, wo korrigierte Zahlen stehen – ohne diesen
// Hinweis wären sie von Messwerten nicht zu unterscheiden.
export function CorrectionNote({ correction }: { correction: CorrectionResult }) {
  if (correction.standard === "none") return null;
  // Ohne die nötigen Umgebungsdaten wird bewusst nicht korrigiert. Für die
  // Luftdichte rechnet die App intern mit Standardwerten, ein Normfaktor wäre
  // daraus aber frei erfunden – also bleibt es beim Messwert.
  if (!correction.applied) {
    return (
      <Note>
        <b>Nicht korrigiert:</b> Für diesen Lauf{" "}
        {correction.missing.length === 1 ? "fehlt" : "fehlen"} {listDe(correction.missing)} – es
        werden die gemessenen Werte gezeigt. {CORRECTION_LABEL[correction.standard]} braucht{" "}
        {REQUIRED_LABELS[correction.standard]}. Die Angaben lassen sich bei der Session nachtragen.
      </Note>
    );
  }
  return (
    <Note>
      <b>Normkorrektur aktiv (experimentell):</b> {formatCorrection(correction)}. Motorleistung und
      -drehmoment sind auf die Referenzbedingungen umgerechnet, die Radleistung bleibt Messwert.
      {!correction.inRange && (
        <>
          {" "}
          <b>
            α liegt außerhalb des nach EWG 80/1269 zulässigen Bereichs (
            {EWG_ALPHA_MIN.toFixed(2).replace(".", ",")}–
            {EWG_ALPHA_MAX.toFixed(2).replace(".", ",")}) – die Messung ist nach Norm nicht
            verwertbar.
          </b>
        </>
      )}
    </Note>
  );
}
