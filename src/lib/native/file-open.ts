// iOS/Android: Datei-Öffnen über das native Share-Sheet ("Öffnen in" / "Kopieren nach").
// Legt die Datei in dieselbe Cache-Storage-Ablage wie der Web-Share-Target-Worker
// und leitet auf /import um – dadurch wird die bestehende Import-Logik genutzt.

const SHARE_CACHE = "dragy-share-target-v1";
const SHARE_KEY = "/__shared-dragy-file";

const IMPORTABLE = /\.(data|ubx|csv|tsv|txt|xlsx|xlsm|xls)$/i;

async function stash(name: string, blob: Blob) {
  const cache = await caches.open(SHARE_CACHE);
  await cache.put(
    SHARE_KEY,
    new Response(blob, {
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        "X-Shared-Filename": encodeURIComponent(name),
      },
    }),
  );
}

/**
 * Registriert den Listener für nativ geöffnete Dateien.
 * Gibt eine Cleanup-Funktion zurück; im Web ist der Aufruf ein No-op.
 */
export async function registerNativeFileOpen(onImport: () => void): Promise<() => void> {
  if (typeof window === "undefined" || typeof caches === "undefined") return () => {};

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return () => {};

    const { App } = await import("@capacitor/app");

    const handle = async (rawUrl: string) => {
      try {
        const decoded = decodeURIComponent(rawUrl);
        const name = decoded.split("?")[0].split("/").pop() || "shared.data";
        if (!IMPORTABLE.test(name)) return;

        const src = Capacitor.convertFileSrc(rawUrl);
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await stash(name, await res.blob());
        onImport();
      } catch {
        // Fehler werden auf der Import-Seite sichtbar gemacht.
      }
    };

    const listener = await App.addListener("appUrlOpen", (event) => {
      if (event?.url) void handle(event.url);
    });

    // Kaltstart: App wurde direkt durch die Datei gestartet.
    const launch = await App.getLaunchUrl();
    if (launch?.url) void handle(launch.url);

    return () => { void listener.remove(); };
  } catch {
    return () => {};
  }
}
