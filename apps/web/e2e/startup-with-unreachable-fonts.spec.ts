import { expect, test } from "@playwright/test";

test("starts without waiting for third-party font services", async ({ page }) => {
  const fontRequests: string[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "font") {
      fontRequests.push(response.url());
    }
  });
  let releaseFonts: () => void = () => {};
  const stalledFonts = new Promise<void>((resolve) => {
    releaseFonts = resolve;
  });
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    await stalledFonts;
    await route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem("aegis:locale", "en");
  });
  try {
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.getByRole("heading", { name: "Build a deck and play live. Free." })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByRole("button", { name: "Build a deck", exact: true })).toBeEnabled();
    const loadedFamilies = await page.evaluate(async () => {
      const families = ["Inter Variable", "Fira Code Variable", "Tektur Variable"];
      return Promise.all(families.map(async (family) => (await document.fonts.load(`700 16px "${family}"`)).length));
    });
    expect(loadedFamilies.every((count) => count > 0)).toBe(true);
    expect(fontRequests.length).toBeGreaterThanOrEqual(3);
    expect(fontRequests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  } finally {
    releaseFonts();
    await page.unrouteAll({ behavior: "wait" });
  }
});
