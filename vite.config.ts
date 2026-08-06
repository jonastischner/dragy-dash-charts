// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";

const isCapacitorBuild = process.env["CAPACITOR_BUILD"] === "true";

function capacitorIndexHtml(): Plugin {
  return {
    name: "capacitor-index-html",
    apply: "build",
    closeBundle() {
      if (!isCapacitorBuild) return;

      // 1. Statische index.html für Capacitor erzeugen.
      // Der TanStack-Start-Prerender läuft in der Cloudflare-Sandbox nicht
      // durch, aber der Client-Build ist zu diesem Zeitpunkt bereits fertig
      // und alle Assets liegen unter dist/client/assets.
      const clientAssetsDir = path.resolve("dist/client/assets");
      if (!fs.existsSync(clientAssetsDir)) return;
      const files = fs.readdirSync(clientAssetsDir);
      const entryJs = files.find((f) => f.startsWith("index-") && f.endsWith(".js"));
      const stylesCss = files.find((f) => f.startsWith("styles-") && f.endsWith(".css"));
      if (!entryJs) return;
      const html = `<!DOCTYPE html>
<html lang="de" class="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="description" content="Client-seitige Analyse von Dragy-GPS-Rohdaten.">
  <title>Dragy Leistungs- & Drehmomentanalyse</title>
  ${stylesCss ? `<link rel="stylesheet" href="./client/assets/${stylesCss}">` : ""}
</head>
<body class="bg-background text-foreground antialiased">
  <script type="module" src="./client/assets/${entryJs}"></script>
</body>
</html>`;
      fs.writeFileSync(path.resolve("dist/index.html"), html);

      // 2. Prerender-Preview-Server erwartet dist/server/server.js, das Nitro-
      // Cloudflare-Preset erzeugt aber index.mjs. Wir spiegeln den Einstieg,
      // damit der Prerender in der Sandbox nicht am fehlenden Modul scheitert.
      const serverDir = path.resolve("dist/server");
      const indexMjs = path.join(serverDir, "index.mjs");
      const serverJs = path.join(serverDir, "server.js");
      if (fs.existsSync(indexMjs) && !fs.existsSync(serverJs)) {
        fs.writeFileSync(serverJs, `export * from "./index.mjs";\nexport { default } from "./index.mjs";\n`);
      }
    },
  };
}

export default defineConfig({
  plugins: [capacitorIndexHtml()],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // Für native iOS-Builds (Capacitor) wird eine statische SPA erzeugt,
    // die aus dem lokalen App-Bundle geladen werden kann.
    ...(isCapacitorBuild
      ? {
          spa: { enabled: true },
          prerender: { enabled: false },
        }
      : {}),
  },
  // Für den lokalen Mac-Build (außerhalb der Lovable-Sandbox) erzwingen wir
  // dieselben Ausgabepfade wie in der Sandbox, damit Capacitor webDir: "dist"
  // findet.
  nitro: isCapacitorBuild
    ? {
        output: {
          dir: "dist",
          publicDir: "dist/client",
          serverDir: "dist/server",
        },
      }
    : undefined,
});
