import { useEffect, useRef, useState } from "react";
import { Button, Field, NumInput, TextArea, TextInput } from "@/components/dragy/ui";
import { Modal } from "./Modal";

export function WaypointDialog({
  defaultDistance, onClose, onAdd,
}: { defaultDistance: number; onClose: () => void; onAdd: (d: number, name: string, note: string) => void }) {
  const [distance, setDistance] = useState(defaultDistance);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => { first.current?.querySelector("input")?.focus(); }, []);
  return (
    <Modal title="Wegpunkt setzen" onClose={onClose}>
      <div className="space-y-3" ref={first}>
        <Field label="Distanz (m)"><NumInput value={distance} onChange={(e) => setDistance(Number(e.target.value) || 0)} /></Field>
        <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Zeitkontrolle" /></Field>
        <Field label="Notiz"><TextArea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
        <Button onClick={() => onAdd(distance, name.trim(), note.trim())}>Hinzufügen</Button>
      </div>
    </Modal>
  );
}
