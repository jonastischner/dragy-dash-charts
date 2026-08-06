import { useEffect, useState } from "react";

export type CapacitorPlatform = "web" | "ios" | "android" | null;

/**
 * Erkennt, ob die App in einem nativen Capacitor-Container läuft.
 * Wird erst clientseitig aufgelöst, damit SSR nicht versucht,
 * auf `window` oder Capacitor-APIs zuzugreifen.
 */
export function useCapacitorPlatform(): CapacitorPlatform {
  const [platform, setPlatform] = useState<CapacitorPlatform>(null);

  useEffect(() => {
    let cancelled = false;
    import("@capacitor/core")
      .then(({ Capacitor }) => {
        if (cancelled) return;
        setPlatform(Capacitor.getPlatform() as CapacitorPlatform);
      })
      .catch(() => {
        if (cancelled) return;
        setPlatform("web");
      });
    return () => { cancelled = true; };
  }, []);

  return platform;
}
