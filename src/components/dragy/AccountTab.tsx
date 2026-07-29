import { useEffect, useState } from "react";
import { Section, Button, TextInput, Field, Note } from "./ui";
import { supabase } from "@/integrations/supabase/client";
import { syncAll, getLastSyncAt } from "@/lib/dragy/sync";
import { useAppStore } from "@/lib/dragy/store";

function formatDate(ts: number | null) {
  if (!ts) return "noch nie";
  const d = new Date(ts);
  return d.toLocaleString();
}

export function AccountTab() {
  const { userEmail, refresh } = useAppStore();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    getLastSyncAt().then(setLastSync);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [userEmail]);

  const doSync = async () => {
    setBusy(true); setMsg(null); setErr(null);
    try {
      const r = await syncAll();
      setMsg(`Synchronisiert: ${r.pulledVehicles} Fahrzeuge, ${r.pulledSessions} Sessions, ${r.pulledSegments} Läufe geladen; ${r.pushed} hochgeladen; ${r.deleted} lokal gelöscht.`);
      setLastSync(await getLastSyncAt());
      await refresh();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally { setBusy(false); }
  };

  const doLogin = async () => {
    setBusy(true); setMsg(null); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setErr(error.message); setBusy(false); return; }
    setPassword("");
    try { await syncAll(); setLastSync(await getLastSyncAt()); await refresh(); setMsg("Angemeldet und synchronisiert."); }
    catch (e: any) { setErr("Angemeldet, aber Synchronisation fehlgeschlagen: " + (e.message ?? e)); }
    setBusy(false);
  };

  const doSignup = async () => {
    setBusy(true); setMsg(null); setErr(null);
    const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    if (error) { setErr(error.message); setBusy(false); return; }
    setMsg("Account angelegt. Falls E-Mail-Bestätigung aktiv ist, prüfe deinen Posteingang. Danach anmelden und deine lokalen Daten werden in die Cloud gespiegelt.");
    setBusy(false);
  };

  const doLogout = async () => {
    setBusy(true); setMsg(null); setErr(null);
    await supabase.auth.signOut();
    setMsg("Abgemeldet. Deine lokalen Daten bleiben auf diesem Gerät erhalten.");
    setBusy(false);
  };

  if (userEmail) {
    return (
      <div>
        <Section title="Konto & Synchronisation" note="Ohne Login bleibt alles lokal. Mit Login werden deine Daten zusätzlich in der Cloud gesichert und mit anderen Geräten geteilt.">
          <p className="text-sm text-foreground">Angemeldet als <span className="font-mono">{userEmail}</span></p>
          <p className="mt-1 text-xs text-muted-foreground">
            Verbindung: {online ? "online" : "offline"} · Letzte Synchronisation: {formatDate(lastSync)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={doSync} disabled={busy || !online}>Jetzt synchronisieren</Button>
            <Button variant="secondary" onClick={doLogout} disabled={busy}>Abmelden</Button>
          </div>
          {msg && <p className="mt-2 text-xs text-emerald-300">{msg}</p>}
          {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
        </Section>
        <Section title="So funktioniert die Synchronisation">
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            <li>Alle Änderungen werden weiterhin sofort lokal in IndexedDB gespeichert – die App funktioniert offline wie bisher.</li>
            <li>Solange du angemeldet und online bist, werden neue/geänderte Datensätze automatisch im Hintergrund in die Cloud gespiegelt.</li>
            <li>Bei Login und beim Knopf „Jetzt synchronisieren" wird in beide Richtungen abgeglichen. Bei Konflikten gewinnt der neuere Zeitstempel.</li>
            <li>Löschungen werden ebenfalls mit einem Zeitstempel („Tombstone") synchronisiert – auch offline gelöschte Datensätze verschwinden nach dem nächsten Sync auf anderen Geräten.</li>
            <li>Ohne Internet läuft alles rein lokal; die Änderungen werden beim nächsten Sync nachgezogen.</li>
          </ul>
        </Section>
      </div>
    );
  }

  const isSignup = mode === "signup";
  return (
    <div>
      <Section
        title={isSignup ? "Neuen Account erstellen" : "Anmelden"}
        note="Ohne Login läuft die App wie bisher komplett lokal. Der Account ist nur nötig, wenn du deine Daten in die Cloud sichern oder auf mehreren Geräten nutzen willst."
      >
        <div className="mb-3 inline-flex rounded-md border border-border bg-muted p-0.5 text-xs">
          <button
            type="button"
            onClick={() => { setMode("login"); setErr(null); setMsg(null); }}
            className={`rounded px-3 py-1.5 font-medium ${!isSignup ? "bg-primary text-white" : "text-muted-foreground"}`}
          >Anmelden</button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setErr(null); setMsg(null); }}
            className={`rounded px-3 py-1.5 font-medium ${isSignup ? "bg-primary text-white" : "text-muted-foreground"}`}
          >Konto erstellen</button>
        </div>
        <div className="grid gap-2">
          <Field label="E-Mail"><TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Passwort"><TextInput type="password" autoComplete={isSignup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <div className="flex flex-wrap gap-2">
            {isSignup ? (
              <Button onClick={doSignup} disabled={busy || !email || !password}>Konto erstellen</Button>
            ) : (
              <Button onClick={doLogin} disabled={busy || !email || !password}>Anmelden</Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {isSignup ? (
              <>Schon ein Konto? <button type="button" className="text-primary underline" onClick={() => setMode("login")}>Hier anmelden</button>.</>
            ) : (
              <>Noch kein Konto? <button type="button" className="text-primary underline" onClick={() => setMode("signup")}>Jetzt kostenlos erstellen</button>.</>
            )}
          </p>
          {msg && <p className="text-xs text-emerald-300">{msg}</p>}
          {err && <p className="text-xs text-red-300">{err}</p>}
        </div>
      </Section>
      <Section title="Was passiert nach dem Login?">
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          <li>Beim ersten Login werden deine bestehenden lokalen Daten in die Cloud gespiegelt.</li>
          <li>Bereits in der Cloud vorhandene Daten (z. B. von einem anderen Gerät) werden lokal ergänzt.</li>
          <li>Danach spiegelt die App jede Änderung automatisch, solange du online bist.</li>
          <li>Meldest du dich ab, bleiben die lokalen Daten auf diesem Gerät erhalten – die Cloud-Kopie bleibt an deinem Account.</li>
        </ul>
      </Section>
    </div>
  );
}
