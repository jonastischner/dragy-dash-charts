import { useState } from "react";
import { Button, Field, NumInput } from "@/components/dragy/ui";
import { formatKm } from "@/services/tripEngine";
import { Modal } from "./Modal";
import type { Trip } from "@/types/trip";

export function CalibrationDialog({ trip, onClose, onApply }: { trip: Trip; onClose: () => void; onApply: (roadbookMeters: number) => void }) {
  const [meters, setMeters] = useState(Math.round(trip.rawGpsMeters));
  return (
    <Modal title="Kalibrieren" onClose={onClose}>
      <p className="mb-3 text-caption text-muted-foreground">
        Roh-GPS aktuell: {formatKm(trip.rawGpsMeters)}. Gib die Roadbook-Meter für dieselbe Strecke ein.
      </p>
      <Field label="Roadbook-Distanz (m)"><NumInput value={meters} onChange={(e) => setMeters(Number(e.target.value) || 0)} /></Field>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
        <Button disabled={trip.rawGpsMeters <= 0 || meters <= 0} onClick={() => onApply(meters)}>Übernehmen</Button>
      </div>
    </Modal>
  );
}
