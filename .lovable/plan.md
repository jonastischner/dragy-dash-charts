# Native iOS-App über TestFlight & App Store

## Ziel
Die bestehende Web-App als native iPhone-App verpacken, zunächst via TestFlight testbar machen und später im App Store veröffentlichen.

## Technischer Ansatz
Die App bleibt eine Web-App und wird mit **Capacitor** in ein natives iOS-Projekt (WKWebView) eingebettet. Das ist der schnellste und wartungsfreundlichste Weg für einen bestehenden React-Stack, weil fast der gesamte Code wiederverwendet werden kann.

## Wichtige Einschränkung vorab
**Web Bluetooth funktioniert auf iOS nicht innerhalb der WKWebView.** Der Tab „Live (BLE)" würde im ersten Schritt im nativen iOS-Build keine Geräte finden können. Für echtes BLE-Aufnehmen auf iPhone müsste später ein natives Swift-Plugin geschrieben und über Capacitor an das WebView angebunden werden. Im Plan daher zwei Phasen:

1. **Phase 1**: App-Grundgerüst mit allen bestehenden Features außer Live-BLE.
2. **Phase 2 (optional)**: Nativer BLE-Recorder, der Dragy/GPS-Daten direkt aus Swift an die Web-App übergibt.

## Phase 1: Capacitor-Grundgerüst

### 1.1 Capacitor installieren & konfigurieren
- `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios` als Dev-Dependencies hinzufügen.
- `capacitor.config.ts` anlegen mit:
  - `appId`: z. B. `deinunternehmen.dragyanalyse`
  - `appName`: `Dragy Leistungsanalyse`
  - `webDir`: `dist` (das Verzeichnis, das `vite build` ausgibt)
  - `bundledWebRuntime: false`
- iOS-Plattform hinzufügen: `npx cap add ios`

### 1.2 Build-Pipeline anpassen
- Neues npm-Script `build:mobile`: `vite build && npx cap sync ios`
- Sicherstellen, dass alle clientseitigen Pfade nach dem Build relativ bleiben (Capacitor lädt aus `file://`-artigem lokalem Bundle).
- Prüfen, ob TanStack-Start-Routen statisch gerendert werden können oder ob SSR im nativen Bundle umgangen werden muss.

### 1.3 Native App-Identität & Assets
- App-Icon-Set (iOS-Größen) und Splash-Screen generieren, z. B. mit `@capacitor/assets`.
- `Info.plist` anpassen:
  - Orientierung (empfohlen: Portrait + Landscape auf iPad)
  - `UIViewControllerBasedStatusBarAppearance`
  - Datenschutz-Hinweise für Kamera/Foto (nur falls später Fahrzeugbild-Kamera genutzt wird)

### 1.4 iOS-spezifische UX-Anpassungen
- Safe-Area/Padding ist bereits teilweise vorhanden (`env(safe-area-inset-*)`).
- Konditionalen Hinweis im Tab „Live (BLE)" einbauen: Auf iOS anzeigen, dass diese Funktion im nativen Build noch nicht verfügbar ist.
- Touch-Target-Größe und Bottom-Tab-Bar bleiben erhalten, da sie bereits mobil-optimiert sind.

### 1.5 Datenspeicherung & Offline
- IndexedDB funktioniert im WKWebView wie im Safari-Browser.
- Supabase-Sync funktioniert, solange Internet verfügbar ist.
- Prüfen, ob `localStorage`-Daten bei App-Updates erhalten bleiben (iOS löscht gelegentlich Web-Caches; Backup-JSON-Export bleibt wichtig).

### 1.6 TestFlight-Vorbereitung
- App-Icon, Launch-Screen und mindestens ein Screenshot für App Store Connect vorbereiten.
- In Xcode:
  - Signing & Capabilities mit Apple Developer Team verknüpfen.
  - App-Version und Build-Nummer setzen.
  - Archivieren (`Product > Archive`) und über Organizer zu App Store Connect hochladen.
- In App Store Connect:
  - App-Eintrag anlegen.
  - TestFlight > Interne Testgruppe einrichten.
  - Compliance-Fragen (Verschlüsselung, Datenschutz) beantworten.

## Phase 2: Nativer BLE-Recorder auf iPhone (optional)

### 2.1 Native iOS-Bluetooth-Schicht
- Swift-Plugin für Capacitor erstellen:
  - CoreBluetooth verwenden.
  - Dragy/GPS-Gerät scannen, verbinden, Daten empfangen.
  - UBX/NMEA-Parsing kann entweder in Swift oder in JavaScript erfolgen.
- JavaScript-Bridge:
  - `startScan()`, `connect(deviceId)`, `startRecording()`, `stopRecording()`
  - Events: `onData`, `onDisconnect`

### 2.2 Web-App-Integration
- Im `LiveTab` erkennen, ob die App im Capacitor-iOS-Container läuft.
- Falls ja: natives Plugin statt Web Bluetooth verwenden.
- Aufnahme weiterhin in IndexedDB-Session speichern.

## Phase 3: App Store-Freigabe

### 3.1 App Store Connect
- Screenshots für alle iPhone-Größen bereitstellen.
- App-Beschreibung, Keywords, Datenschutz-Details.
- App Review Information (Kontakt, Demo-Account falls nötig).

### 3.2 Review-Richtlinien beachten
- App muss mehr tun als eine einfache Website anzeigen.
- Aktuelle App bietet bereits native-adjente Features: Offline-Datenbank, Datei-Import, Diagramme, BLE-Aufnahme.
- Keine versteckten Zahlungswege; falls später In-App-Käufe kommen, müssen diese über StoreKit laufen.

## Kosten & Voraussetzungen
- Apple Developer Program: ca. 99 USD/Jahr.
- Ein Mac ist für Xcode-Build und Upload erforderlich.
- Für TestFlight reicht der Developer-Account; öffentlicher App Store erfordert Review.

## Nächster konkreter Schritt
Capacitor in das Projekt integrieren, iOS-Plattform hinzufügen und ein erstes TestFlight-fähiges Archiv erzeugen – ohne native BLE in Phase 1.
