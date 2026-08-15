import { useState } from "react";
import { Button, Field, Note, NumInput, TextInput } from "@/components/dragy/ui";
import { errorMessage } from "@/lib/dragy/errors";
import { Modal } from "./Modal";

export function AddStageDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (input: {
    wpNummer?: string;
    name: string;
    laengeKm?: number;
    startUhrzeit?: string;
  }) => void | Promise<void>;
}) {
  const [wpNummer, setWpNummer] = useState("");
  const [name, setName] = useState("");
  const [laengeKm, setLaengeKm] = useState<number | "">("");
  const [datum, setDatum] = useState("");
  const [zeit, setZeit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd({
        wpNummer: wpNummer.trim() || undefined,
        name: name.trim(),
        laengeKm: laengeKm === "" ? undefined : Number(laengeKm),
        startUhrzeit: datum && zeit ? new Date(`${datum}T${zeit}`).toISOString() : undefined,
      });
    } catch (e) {
      setError(errorMessage(e, "Wertungsprüfung konnte nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Wertungsprüfung" onClose={onClose}>
      <div className="space-y-3">
        {error && <Note>{error}</Note>}
        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <Field label="WP-Nr.">
            <TextInput
              value={wpNummer}
              onChange={(e) => setWpNummer(e.target.value)}
              placeholder="3"
            />
          </Field>
          <Field label="Name">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Baumholder"
            />
          </Field>
        </div>
        <Field label="Länge (km)">
          <NumInput
            step="0.01"
            value={laengeKm}
            onChange={(e) => setLaengeKm(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start-Datum" hint="optional">
            <TextInput type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
          </Field>
          <Field label="Start-Uhrzeit" hint="optional">
            <TextInput type="time" value={zeit} onChange={(e) => setZeit(e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>
          Abbrechen
        </Button>
        <Button onClick={submit} loading={saving} disabled={!name.trim()}>
          Hinzufügen
        </Button>
      </div>
    </Modal>
  );
}
