import { usePersistedState } from "./ui";
import {
  correctionFactor,
  type CorrectionResult,
  type CorrectionStandard,
} from "@/lib/dragy/correction";
import type { Session } from "@/lib/dragy/types";

// Gemeinsamer Zugriff auf die experimentelle Normkorrektur. Die gewählte Norm
// ist eine reine Anzeige-Einstellung (localStorage, wie die übrigen Prefs) und
// wird bewusst NICHT an Session/Vehicle gespeichert: die Korrektur ist eine
// Darstellungs-Transformation, keine Messgröße. Dadurch bleiben Datenmodell und
// Cloud-Sync unangetastet und das Experiment ist rückstandsfrei entfernbar.

const STORAGE_KEY = "dragy.correction.standard";

export function useCorrectionStandard() {
  return usePersistedState<CorrectionStandard>(STORAGE_KEY, "none");
}

/** Korrekturfaktor für die Umgebungsbedingungen einer Session. */
export function sessionCorrection(
  standard: CorrectionStandard,
  session: Session,
): CorrectionResult {
  return correctionFactor(standard, session.tempC, session.pressureHpa, session.rh);
}

/** Kombiniert Einstellung und Session zu einem fertigen Faktor. */
export function useSessionCorrection(session: Session): CorrectionResult {
  const [standard] = useCorrectionStandard();
  return sessionCorrection(standard, session);
}
