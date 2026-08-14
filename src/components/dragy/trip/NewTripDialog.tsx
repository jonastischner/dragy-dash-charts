import { useState } from "react";
import { Button, Field, NumInput, TextInput } from "@/components/dragy/ui";
import { Modal } from "./Modal";
import type { RallyeMode } from "@/types/trip";

export function NewTripDialog({
  mode, onClose, onCreate,
}: {
  mode: RallyeMode;
  onClose: () => void;
  onCreate: (name: string, total: number, targetTimeSeconds?: number, targetSpeed?: number) => void;
}) {
  const [name, setName] = useState("");
  const [total, setTotal] = useState(10000);
  const [targetMin, setTargetMin] = useState(0);
  const [targetSpeed, setTargetSpeed] = useState(50);

  const title = mode === "bestzeit" ? "Neue Bestzeit-Etappe" : "Neue Gleichmäßigkeits-Etappe";

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Etappe 1" /></Field>
        <Field label="Gesamtstrecke (m)"><NumInput value={total} onChange={(e) => setTotal(Number(e.target.value) || 0)} /></Field>
        {mode === "durchschnitt" && (
          <>
            <Field label="Sollzeit (Minuten)" hint="0 = aus Soll-Ø berechnen">
              <NumInput value={targetMin} onChange={(e) => setTargetMin(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Soll-Ø (km/h)"><NumInput value={targetSpeed} onChange={(e) => setTargetSpeed(Number(e.target.value) || 0)} /></Field>
          </>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
        <Button
          onClick={() => onCreate(
            name.trim() || "Neue Etappe",
            total,
            mode === "durchschnitt" && targetMin > 0 ? targetMin * 60 : undefined,
            mode === "durchschnitt" ? targetSpeed : undefined,
          )}
        >
          Erstellen
        </Button>
      </div>
    </Modal>
  );
}
