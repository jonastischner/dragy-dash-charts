import { Note } from "./ui";
import {
  EWG_ALPHA_MAX,
  EWG_ALPHA_MIN,
  formatCorrection,
  type CorrectionResult,
} from "@/lib/dragy/correction";

// Hinweis, dass gerade normkorrigierte statt gemessene Werte angezeigt werden.
// Bewusst überall dort eingeblendet, wo korrigierte Zahlen stehen – ohne diesen
// Hinweis wären sie von Messwerten nicht zu unterscheiden.
export function CorrectionNote({ correction }: { correction: CorrectionResult }) {
  if (correction.standard === "none") return null;
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
