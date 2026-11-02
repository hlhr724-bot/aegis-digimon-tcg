import fixture from "@api-fixtures/field-card-size-by-viewport.fixture";
import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";

for (const dark of [false, true]) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 2560, height: 1440 },
    { width: 3840, height: 2160 },
  ]) {
    test(`keeps desktop raising zones visible at ${viewport.width}x${viewport.height} in ${dark ? "dark" : "light"} mode`, async ({
      scenario,
      page,
    }) => {
      await stubCardArtwork(page);
      await page.addInitScript((darkMode) => localStorage.setItem("aegis:darkMode", String(darkMode)), dark);
      await page.setViewportSize(viewport);
      await scenario.openFixture(fixture, "normal", "none");
      await expect(page.locator(".game-egg-deck--hatchable")).toBeVisible();
      const zones = page.locator(
        ".game-utility-slot--you-eggs, .game-utility-slot--you-raising, .game-utility-slot--opp-eggs, .game-utility-slot--opp-raising",
      );
      await expect(zones).toHaveCount(4);
      async function expectZonesInsideViewport() {
        await expect(async () => {
          const bounds = await zones.evaluateAll((elements) =>
            elements.map((element) => ({ name: element.className, ...element.getBoundingClientRect().toJSON() })),
          );
          for (const boundsOfZone of bounds) {
            expect(boundsOfZone.left, boundsOfZone.name).toBeGreaterThanOrEqual(0);
            expect(boundsOfZone.top, boundsOfZone.name).toBeGreaterThanOrEqual(0);
            expect(boundsOfZone.right, boundsOfZone.name).toBeLessThanOrEqual(viewport.width);
            expect(boundsOfZone.bottom, boundsOfZone.name).toBeLessThanOrEqual(viewport.height);
          }
        }).toPass({ timeout: 5000 });
      }
      await expectZonesInsideViewport();
      await page.locator(".game-egg-deck--hatchable").click();
      await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
      await scenario.healthy();
      await expectZonesInsideViewport();
    });
  }
}
