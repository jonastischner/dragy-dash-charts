import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "de.dragyanalyse.app",
  appName: "Dragy Leistungsanalyse",
  webDir: "dist",
  bundledWebRuntime: false,
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#121212",
    },
  },
};

export default config;
