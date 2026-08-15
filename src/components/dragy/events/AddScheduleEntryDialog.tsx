import { useState } from "react";
import { Button, Field, Note, TextInput } from "@/components/dragy/ui";
import { Modal } from "./Modal";

export function AddScheduleEntryDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (input: { uhrzeit: string; programmpunkt: string }) => void | Promise<void>;
}) {
  const [datum, setDatum] = useState("");
  const [zeit, setZeit] = useState("");
  const [programmpunkt, setProgrammpunkt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!datum || !zeit || !programmpunkt.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd({
        uhrzeit: new Date(`${datum}T${zeit}`).toISOString(),
        programmpunkt: programmpunkt.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eintrag konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Zeitplan-Eintrag" onClose={onClose}>
      <div className="space-y-3">
        {error && <Note>{error}</Note>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum">
            <TextInput type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
          </Field>
          <Field label="Uhrzeit">
            <TextInput type="time" value={zeit} onChange={(e) => setZeit(e.target.value)} />
          </Field>
        </div>
        <Field label="Programmpunkt">
          <TextInput
            value={programmpunkt}
            onChange={(e) => setProgrammpunkt(e.target.value)}
            placeholder="Administrative Abnahme"
          />
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          onClick={submit}
          loading={saving}
          disabled={!datum || !zeit || !programmpunkt.trim()}
        >
          Hinzufügen
        </Button>
      </div>
    </Modal>
  );
}
