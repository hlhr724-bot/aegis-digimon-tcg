import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

const webPort = Number(process.env.AEGIS_E2E_WEB_PORT ?? 4175);
const edgePort = Number(process.env.AEGIS_E2E_EDGE_PORT ?? 2569);

export default defineConfig({
  ...baseConfig,
  testMatch: "**/*.device.ts",
  timeout: 300_000,
  use: { ...baseConfig.use, viewport: null, storageState: undefined, screenshot: "off", trace: "off" },
  webServer: {
    command: `NODE_ENV=production VITE_AEGIS_DEPLOYMENT_MODE=direct VITE_AEGIS_API_URL=ws://127.0.0.1:${edgePort} node e2e/production-server.mjs`,
    timeout: 180_000,
    url: `http://127.0.0.1:${webPort}/e2e/harness.html`,
    reuseExistingServer: false,
  },
});
