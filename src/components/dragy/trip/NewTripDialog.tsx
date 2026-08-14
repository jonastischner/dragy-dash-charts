import { useState } from "react";
import { Button, Field, NumInput, Select, TextInput } from "@/components/dragy/ui";
import { Modal } from "./Modal";
import type { RallyeMode } from "@/types/trip";

export function NewTripDialog({
  onClose, onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, mode: RallyeMode, total: number, targetTimeSeconds?: number, targetSpeed?: number) => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<RallyeMode>("bestzeit");
  const [total, setTotal] = useState(10000);
  const [targetMin, setTargetMin] = useState(0);
  const [targetSpeed, setTargetSpeed] = useState(50);

  return (
    <Modal title="Neuen Trip erstellen" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Trip C" /></Field>
        <Field label="Modus">
          <Select value={mode} onChange={(e) => setMode(e.target.value as RallyeMode)}>
            <option value="bestzeit">Bestzeitrallye</option>
            <option value="durchschnitt">Durchschnitts-Rallye</option>
          </Select>
        </Field>
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
            name.trim() || "Neuer Trip",
            mode,
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
