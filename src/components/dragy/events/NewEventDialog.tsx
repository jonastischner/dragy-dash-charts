import { useState } from "react";
import { Button, Field, Note, TextInput } from "@/components/dragy/ui";
import { Modal } from "./Modal";

export function NewEventDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: {
    name: string;
    ort?: string;
    datumStart?: string;
    datumEnde?: string;
  }) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [ort, setOrt] = useState("");
  const [datumStart, setDatumStart] = useState("");
  const [datumEnde, setDatumEnde] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        ort: ort.trim() || undefined,
        datumStart: datumStart || undefined,
        datumEnde: datumEnde || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veranstaltung konnte nicht erstellt werden.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Neue Veranstaltung" onClose={onClose}>
      <div className="space-y-3">
        {error && <Note>{error}</Note>}
        <Field label="Name">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ADAC Rallye Deutschland"
          />
        </Field>
        <Field label="Ort">
          <TextInput value={ort} onChange={(e) => setOrt(e.target.value)} placeholder="Trier" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum Start">
            <TextInput
              type="date"
              value={datumStart}
              onChange={(e) => setDatumStart(e.target.value)}
            />
          </Field>
          <Field label="Datum Ende">
            <TextInput
              type="date"
              value={datumEnde}
              onChange={(e) => setDatumEnde(e.target.value)}
            />
          </Field>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>
          Abbrechen
        </Button>
        <Button onClick={submit} loading={saving} disabled={!name.trim()}>
          Erstellen
        </Button>
      </div>
    </Modal>
  );
}
