import { useState } from "react";
import { Button, Field, NumInput } from "@/components/dragy/ui";
import { Modal } from "./Modal";
import type { Trip } from "@/types/trip";

export function TargetDialog({
  trip, onClose, onApply,
}: {
  trip: Trip;
  onClose: () => void;
  onApply: (target: { targetTimeSeconds?: number; targetSpeed?: number }) => void;
}) {
  const [targetMin, setTargetMin] = useState(trip.targetTimeSeconds ? Math.round(trip.targetTimeSeconds / 60) : 0);
  const [targetSpeed, setTargetSpeed] = useState(trip.targetSpeed ?? 50);

  return (
    <Modal title="Sollwerte bearbeiten" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Sollzeit (Minuten)" hint="0 = aus Soll-Ø berechnen">
          <NumInput value={targetMin} onChange={(e) => setTargetMin(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Soll-Ø (km/h)"><NumInput value={targetSpeed} onChange={(e) => setTargetSpeed(Number(e.target.value) || 0)} /></Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
        <Button
          onClick={() => onApply({
            targetTimeSeconds: targetMin > 0 ? targetMin * 60 : undefined,
            targetSpeed,
          })}
        >
          Übernehmen
        </Button>
      </div>
    </Modal>
  );
}
