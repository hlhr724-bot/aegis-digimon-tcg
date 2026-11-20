import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { test as scenarioTest } from "@e2e/scenario-page";

const webPort = Number(process.env.AEGIS_E2E_WEB_PORT ?? 4175);
const edgePort = Number(process.env.AEGIS_E2E_EDGE_PORT ?? 2569);
const devtoolsPort = Number(process.env.AEGIS_DEVICE_DEVTOOLS_PORT ?? 9222);

function adb(...args: string[]) {
  execFileSync("adb", args, { stdio: "pipe" });
}

async function openDesktopPhone(baseURL: string | undefined) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 384, height: 749 },
    deviceScaleFactor: 2.8125,
    isMobile: true,
    hasTouch: true,
  });
  return { browser, context };
}

async function openConnectedPhone(baseURL: string | undefined) {
  adb("reverse", `tcp:${webPort}`, `tcp:${webPort}`);
  adb("reverse", `tcp:${edgePort}`, `tcp:${edgePort}`);
  adb("forward", `tcp:${devtoolsPort}`, "localabstract:chrome_devtools_remote");
  adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "about:blank", "-p", "com.android.chrome");
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${devtoolsPort}`);
  const context = await browser.newContext({ baseURL, viewport: null });
  return { browser, context };
}

export const test = scenarioTest.extend({
  page: async ({ baseURL }, use) => {
    const { browser, context } =
      process.env.AEGIS_DEVICE_TARGET === "desktop"
        ? await openDesktopPhone(baseURL)
        : await openConnectedPhone(baseURL);
    const page = await context.newPage();
    await page.bringToFront();
    try {
      await use(page);
    } finally {
      await context.close();
      await browser.close();
    }
  },
});
export { expect } from "@e2e/scenario-page";
