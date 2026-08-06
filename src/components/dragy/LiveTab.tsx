import { useCallback, useEffect, useRef, useState } from "react";
import { Bluetooth, Circle, Square } from "lucide-react";
import { Section, Field, Row, Button, Note, TextInput, NumInput, Select, EmptyState, usePersistedState } from "./ui";
import { useAppStore } from "@/lib/dragy/store";
import { uid } from "@/lib/dragy/db";
import { useCapacitorPlatform } from "@/lib/capacitor";
import {
  NORDIC_UART, bleSupported, connectBle, createParser, pointsToRecords, toAscii, toHex,
  type BleConnection, type StreamFormat, type StreamPoint,
} from "@/lib/dragy/ble";
import type { Session } from "@/lib/dragy/types";

export function LiveTab({ onOpenVehicles }: { onOpenVehicles?: () => void } = {}) {
  const { state, saveSession } = useAppStore();
  const activeVehicle = state.vehicles.find((v) => v.id === state.activeVehicleId);
  const platform = useCapacitorPlatform();

  const [serviceUuid, setServiceUuid] = usePersistedState("live.serviceUuid", NORDIC_UART.service);
  const [notifyUuid, setNotifyUuid] = usePersistedState("live.notifyUuid", NORDIC_UART.notify);
  const [format, setFormat] = usePersistedState<StreamFormat>("live.format", "ubx");
  const [tempC, setTempC] = usePersistedState("live.tempC", 20);
  const [pressureHpa, setPressureHpa] = usePersistedState("live.pressureHpa", 1013);
  const [rh, setRh] = usePersistedState("live.rh", 50);

  const [conn, setConn] = useState<BleConnection | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monitor, setMonitor] = useState<string[]>([]);
  const [bytes, setBytes] = useState(0);
  const [last, setLast] = useState<StreamPoint | null>(null);
  const [recording, setRecording] = useState(false);
  const [count, setCount] = useState(0);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const parserRef = useRef(createParser(format));
  const recordingRef = useRef(false);
  const pointsRef = useRef<StreamPoint[]>([]);
  const connRef = useRef<BleConnection | null>(null);

  useEffect(() => { parserRef.current = createParser(format); }, [format]);
  useEffect(() => () => { connRef.current?.disconnect(); }, []);

  if (platform === "ios") {
    return (
      <Section title="Live-Aufnahme (Bluetooth)">
        <EmptyState
          title="BLE-Aufnahme in der iOS-App noch nicht verfügbar"
          description="Die native Bluetooth-Verbindung für Dragy/GPS-Logger wird in einem späteren Update über ein Swift-Plugin ergänzt. Bis dahin kannst du .ubx-, .csv- oder Excel-Dateien im Import-Tab laden."
        />
      </Section>
    );
  }

  const onChunk = useCallback((chunk: Uint8Array) => {
    setBytes((b) => b + chunk.length);
    setMonitor((m) => [`${toHex(chunk)}   |   ${toAscii(chunk)}`, ...m].slice(0, 20));
    const pts = parserRef.current.push(chunk);
    if (pts.length === 0) return;
    setLast(pts[pts.length - 1]);
    if (recordingRef.current) {
      pointsRef.current.push(...pts);
      setCount(pointsRef.current.length);
    }
  }, []);

  const connect = async () => {
    setError(null); setConnecting(true);
    try {
      parserRef.current.reset();
      const c = await connectBle({
        serviceUuid, notifyUuid, onChunk,
        onDisconnect: () => { connRef.current = null; setConn(null); recordingRef.current = false; setRecording(false); },
      });
      connRef.current = c; setConn(c);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    connRef.current?.disconnect();
    connRef.current = null; setConn(null);
    recordingRef.current = false; setRecording(false);
  };

  const startRec = () => {
    pointsRef.current = []; setCount(0); setSaveMsg(null);
    recordingRef.current = true; setRecording(true);
  };

  const stopRec = async () => {
    recordingRef.current = false; setRecording(false);
    const records = pointsToRecords(pointsRef.current);
    if (!activeVehicle) return;
    if (records.length < 3) { setSaveMsg("Zu wenige Datenpunkte – Lauf nicht gespeichert."); return; }
    const s: Session = {
      id: uid(), vehicleId: activeVehicle.id,
      name: `Live ${new Date().toLocaleString("de-DE")}`,
      records, tempC, pressureHpa, rh, manual: false, createdAt: Date.now(), kind: module,
    };
    await saveSession(s);
    setSaveMsg(`Session gespeichert: ${records.length} Punkte (${records[records.length - 1].t.toFixed(1)} s).`);
  };

  if (!bleSupported()) {
    return (
      <Section title="Live-Aufnahme (Bluetooth)">
        <EmptyState
          title="Web Bluetooth nicht verfügbar"
          description="Dieser Browser unterstützt Web Bluetooth nicht. Es funktioniert in Chrome oder Edge auf Android und Desktop – auf iPhone/iPad ist ein BLE-Zugriff im Browser technisch nicht möglich. Nutze dort den Import von .ubx-/CSV-Dateien."
        />
      </Section>
    );
  }

  if (!activeVehicle) {
    return (
      <Section title="Live-Aufnahme (Bluetooth)">
        <EmptyState title="Kein aktives Fahrzeug" description="Für die Aufnahme wird ein aktives Fahrzeug benötigt." actionLabel="Fahrzeug anlegen" onAction={onOpenVehicles} />
      </Section>
    );
  }

  return (
    <div>
      <Section title="Gerät verbinden">
        <Note>
          Das Dragy-Protokoll ist nicht öffentlich dokumentiert. Diese Anbindung ist generisch: Service- und
          Notify-UUID sowie das Datenformat sind einstellbar (Standard: Nordic-UART, wie von vielen GPS-Loggern
          verwendet). Passt das Format nicht, hilft der Rohdaten-Monitor unten beim Bestimmen des Protokolls.
        </Note>
        <Row>
          <Field label="Service-UUID"><TextInput value={serviceUuid} onChange={(e) => setServiceUuid(e.target.value)} spellCheck={false} /></Field>
          <Field label="Notify-Characteristic-UUID"><TextInput value={notifyUuid} onChange={(e) => setNotifyUuid(e.target.value)} spellCheck={false} /></Field>
          <Field label="Datenformat" hint="UBX = u-blox NAV-PVT, NMEA = Textsätze, Rohdaten = nur Monitor">
            <Select value={format} onChange={(e) => setFormat(e.target.value as StreamFormat)}>
              <option value="ubx">UBX (NAV-PVT)</option>
              <option value="nmea">NMEA (RMC/GGA)</option>
              <option value="raw">Rohdaten (nur Monitor)</option>
            </Select>
          </Field>
        </Row>
        <div className="mt-2 flex flex-wrap gap-2">
          {conn ? (
            <Button variant="danger" onClick={disconnect}>Trennen</Button>
          ) : (
            <Button onClick={connect} disabled={connecting}>
              <Bluetooth className="mr-2 h-4 w-4" aria-hidden="true" />
              {connecting ? "Verbinde…" : "Gerät suchen…"}
            </Button>
          )}
          <Button variant="secondary" onClick={() => { setServiceUuid(NORDIC_UART.service); setNotifyUuid(NORDIC_UART.notify); }}>
            UUIDs zurücksetzen
          </Button>
        </div>
        {conn && <p className="mt-2 text-caption text-muted-foreground">Verbunden mit <b>{conn.deviceName}</b> – {bytes} Byte empfangen.</p>}
        {error && <p className="mt-2 text-caption text-destructive">{error}</p>}
      </Section>

      <Section title="Aufnahme">
        <Row>
          <Field label="Temperatur (°C)"><NumInput value={tempC} onChange={(e) => setTempC(+e.target.value)} /></Field>
          <Field label="Luftdruck (hPa)"><NumInput value={pressureHpa} onChange={(e) => setPressureHpa(+e.target.value)} /></Field>
          <Field label="Rel. Luftfeuchte (%)"><NumInput value={rh} onChange={(e) => setRh(+e.target.value)} /></Field>
        </Row>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-caption text-muted-foreground">Geschwindigkeit</div>
            <div className="text-subtitle text-foreground">{last ? last.speedKmh.toFixed(1) : "–"} km/h</div>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-caption text-muted-foreground">Höhe</div>
            <div className="text-subtitle text-foreground">{last ? last.heightM.toFixed(1) : "–"} m</div>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-caption text-muted-foreground">Aufgenommene Punkte</div>
            <div className="text-subtitle text-foreground">{count}</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {recording ? (
            <Button variant="danger" onClick={stopRec}>
              <Square className="mr-2 h-4 w-4" aria-hidden="true" /> Stoppen & speichern
            </Button>
          ) : (
            <Button onClick={startRec} disabled={!conn || format === "raw"}>
              <Circle className="mr-2 h-4 w-4" aria-hidden="true" /> Aufnahme starten
            </Button>
          )}
        </div>
        {format === "raw" && <Note>Im Rohdaten-Modus ist keine Aufnahme möglich – wähle UBX oder NMEA.</Note>}
        {saveMsg && <p className="mt-2 text-caption text-muted-foreground">{saveMsg}</p>}
      </Section>

      <Section title="Rohdaten-Monitor" note="Letzte 20 BLE-Pakete als Hex und ASCII – hilfreich, um ein unbekanntes Protokoll zu erkennen.">
        {monitor.length === 0 ? (
          <p className="text-caption text-muted-foreground">Noch keine Daten empfangen.</p>
        ) : (
          <>
            <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted p-2 text-[11px] leading-relaxed text-muted-foreground">
              {monitor.join("\n")}
            </pre>
            <Button className="mt-2" variant="secondary" onClick={() => navigator.clipboard?.writeText(monitor.join("\n"))}>
              Monitor kopieren
            </Button>
          </>
        )}
      </Section>
    </div>
  );
}
