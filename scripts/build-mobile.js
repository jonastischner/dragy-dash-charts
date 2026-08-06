#!/usr/bin/env node
/**
 * Mobiler Build-Wrapper für Capacitor/iOS.
 *
 * TanStack Start's Prerender funktioniert in der Lovable-Cloudflare-Sandbox
 * nicht (Request.ip ist read-only in Node 22), liefert aber trotzdem alle
 * Client-Assets. Dieses Script führt den Build aus, ignoriert den bekannten
 * Prerender-Fehler, sofern die Assets vorhanden sind, erzeugt eine statische
 * index.html im dist-Root und synchronisiert dann Capacitor mit iOS.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const clientAssetsDir = path.join(distDir, "client", "assets");
const indexHtmlPath = path.join(distDir, "index.html");

function ensureIndexHtml() {
  if (!fs.existsSync(clientAssetsDir)) {
    throw new Error(
      `Client-Assets nicht gefunden unter ${clientAssetsDir}. Der Build ist fehlgeschlagen.`
    );
  }

  const files = fs.readdirSync(clientAssetsDir);
  const entryJs = files.find((f) => f.startsWith("index-") && f.endsWith(".js"));
  const stylesCss = files.find(
    (f) => f.startsWith("styles-") && f.endsWith(".css")
  );

  if (!entryJs) {
    throw new Error(
      `Kein index-*.js Eintrag in ${clientAssetsDir} gefunden.`
    );
  }

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

  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(indexHtmlPath, html);
  console.log(`[capacitor] ${indexHtmlPath} erzeugt`);
}

function run(command, args, env = {}) {
  console.log(`[capacitor] $ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: false,
  });
  return result.status ?? 1;
}

// 1. Vite-Build ausführen. Der Prerender-Schritt kann in der Sandbox fehlschlagen,
//    aber die Client-Assets werden zuvor bereits geschrieben.
const buildStatus = run("bun", ["run", "build"], { CAPACITOR_BUILD: "true" });

// 2. Assets prüfen und index.html erzeugen – unabhängig vom Exit-Code,
//    solange die Assets existieren.
try {
  ensureIndexHtml();
} catch (err) {
  console.error("[capacitor] Build-Artefakte unvollständig:", err.message);
  process.exit(buildStatus || 1);
}

// 3. Wenn der Build mit einem anderen Fehler als dem bekannten Prerender-Problem
//    ausgefallen ist, warnen wir trotzdem – die Assets sind aber vorhanden.
if (buildStatus !== 0) {
  console.warn(
    `[capacitor] Hinweis: vite build endete mit Exit-Code ${buildStatus} (meist Prerender in der Sandbox). Fortfahren, da Client-Assets vorhanden sind.`
  );
}

// 4. Capacitor mit iOS synchronisieren.
const syncStatus = run("npx", ["cap", "sync", "ios"]);
if (syncStatus !== 0) {
  console.error("[capacitor] cap sync ios fehlgeschlagen");
  process.exit(syncStatus);
}

console.log("[capacitor] iOS-Build erfolgreich vorbereitet.");
console.log("[capacitor] Öffne im Mac-Terminal: npx cap open ios");
