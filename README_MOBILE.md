# Native iOS-App mit Capacitor

Diese App wird als **Progressive Web App (PWA)** in Lovable entwickelt und über
**Capacitor** in eine native iOS-App überführt. Der Code bleibt zu 100 %
TypeScript/React; Capacitor packt das Web-Bundle in einen nativen iOS-Wrapper
(WKWebView).

## Voraussetzungen

- Ein **Mac** mit macOS (Xcode läuft nur auf Apple-Hardware).
- **Xcode** 15 oder neuer aus dem Mac App Store.
- **Node.js 22+** und **Bun** (oder npm).
- Ein **Apple Developer Account** (für TestFlight: persönlicher Account reicht;
  für den App Store: Paid Developer Program, 99 €/Jahr).
- (Empfohlen) CocoaPods wird von Capacitor nicht mehr benötigt, da Capacitor 6
  Swift Package Manager nutzt.

## Lokaler Build-Workflow

### 1. Repository auf dem Mac auschecken

```bash
git clone <repo-url>
cd <projekt>
bun install
```

### 2. iOS-Plattform vorbereiten

Die iOS-Plattform ist bereits im Repository vorhanden (`ios/`). Falls sie
je neu angelegt werden muss:

```bash
npx cap add ios
```

### 3. Web-Bundle bauen und in iOS synchronisieren

```bash
bun run build:mobile
```

Dieser Befehl:

1. Führt `vite build` mit `CAPACITOR_BUILD=true` aus.
2. Erzeugt aus den Client-Assets eine statische `dist/index.html`.
3. Kopiert das Bundle mit `npx cap sync ios` in `ios/App/App/public`.

> Hinweis: TanStack Start's Prerender schlägt in der Lovable-Cloudflare-Sandbox
> fehl (`Request.ip` ist in Node 22 read-only). Das ist bekannt und unkritisch,
> weil alle für Capacitor benötigten Client-Assets trotzdem gebaut werden. Das
> Wrapper-Script `scripts/build-mobile.js` fährt deshalb trotz Exit-Code 1 fort.

### 4. In Xcode öffnen und auf einem Gerät oder Simulator laufen lassen

```bash
npx cap open ios
```

In Xcode:

- **Signing & Capabilities** → Team auswählen.
- Ein angeschlossenes iPhone oder einen Simulator wählen.
- **Run** (⌘R) drücken.

## App-Icon & Splash-Screen

Capacitor verwendet die Bilder in `ios/App/App/Assets.xcassets`. Für eine
professionelle Veröffentlichung solltest du eigene Quellen hinterlegen:

1. Erstelle im Projektroot einen Ordner `assets/`.
2. Lege folgende Dateien ab:
   - `assets/icon.png` (mindestens 1024×1024 px, ohne Transparenz)
   - `assets/splash.png` (mindestens 2732×2732 px)
   - Optional: `assets/splash-dark.png` für Dark Mode
3. Führe aus:

```bash
bun run assets:mobile
```

Dies generiert alle benötigten iOS-Icon- und Splash-Screen-Größen.

## TestFlight

1. In Xcode: **Product → Archive** (Gerät oder "Any iOS Device" muss als Ziel
   gewählt sein, kein Simulator).
2. **Window → Organizer** öffnet sich automatisch.
3. Den neuen Archive-Eintrag auswählen → **Distribute App**.
4. **App Store Connect** → **Upload**.
5. Nach dem Upload in [App Store Connect](https://appstoreconnect.apple.com):
   - App-Informationen und Test-Details pflegen.
   - Interne Testgruppe erstellen oder externe Tester einladen.
   - Build zu TestFlight hinzufügen.

## App Store

1. In **App Store Connect** eine neue App anlegen:
   - Name, SKU, Bundle-ID (z. B. `de.dragyanalyse.app`).
   - Plattform: iOS.
2. App-Store-Metadaten ausfüllen (Screenshots, Beschreibung,
   Datenschutzerklärung).
3. Build aus TestFlight der App-Store-Version zuordnen.
4. **Submit for Review**.

## Wichtige native Einschränkungen

### Web Bluetooth im WKWebView

Die App enthält eine **Live-Aufnahme** über Web Bluetooth (`src/lib/dragy/ble.ts`).
**Web Bluetooth ist in iOS WKWebView standardmäßig nicht verfügbar.** Für eine
vollständige Dragy-Geräte-Integration auf iOS bräuchtest du entweder:

- Einen **nativen Capacitor-Plugin** für Bluetooth LE (z. B. eigene Swift-Bridge
  oder Community-Plugin), das die GPS-Daten an das WebView weiterreicht, oder
- Du nutzt die Live-Funktion weiterhin im **Browser** (Chrome/Edge auf Desktop/
  Android) und importierst im iOS-App weiterhin Dateien.

### Hintergrund-Standort (Background GPS)

Für längere Fahrzeug-Messungen im Hintergrund müssen in Xcode ergänzt werden:

- **Info.plist**:
  - `NSLocationWhenInUseUsageDescription`
  - `NSLocationAlwaysAndWhenInUseUsageDescription`
- **Signing & Capabilities** → **Background Modes** →
  **Location updates** aktivieren.

### Dateisystem & Import

CSV/Excel/UBX-Dateien werden im WebView über `<input type="file">` importiert.
Auf iOS funktioniert das Datei-Picker-Dialog nativ. Für direkten Zugriff auf das
iOS-Dateisystem (z. B. Files-App-Ordner) ist das `@capacitor/filesystem`-Plugin
nötig.

## Technischer Hintergrund

- `capacitor.config.ts`: App-Name, Bundle-ID, Web-Asset-Ordner (`dist`).
- `vite.config.ts`: Erzeugt im Capacitor-Modus eine statische `dist/index.html`
  und einen `server.js`-Shim für den Prerender-Preview-Server.
- `scripts/build-mobile.js`: Führt den Build aus, ignoriert den bekannten
  Prerender-Fehler und synchronisiert das Ergebnis mit iOS.
