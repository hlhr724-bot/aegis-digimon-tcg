import fixture from "@api-fixtures/crowded-field-touch-access.fixture";
import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";

for (const theme of ["light", "dark"] as const) {
  test(`preserves battle lane preference across viewport changes in ${theme} mode`, async ({ scenario, page }) => {
    await stubCardArtwork(page);
    await page.addInitScript((dark) => {
      localStorage.setItem("aegis:darkMode", String(dark));
      localStorage.setItem("aegis.battle-lanes", "two");
    }, theme === "dark");
    await page.setViewportSize({ width: 1366, height: 768 });
    await scenario.openFixture(fixture);
    const rows = page.locator('[data-field-layout="organized"]');
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) {
      await expect(row).toHaveAttribute("data-lanes", "side-by-side");
      await expect(row.getByRole("group")).toHaveCount(2);
      for (const lane of await row.getByRole("group").all()) {
        await expect(lane).toBeVisible();
      }
    }
    await page.setViewportSize({ width: 1920, height: 1200 });
    for (const row of await rows.all()) {
      await expect(row).toHaveAttribute("data-lanes", "stacked");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const row of await rows.all()) {
      await expect(row).toHaveAttribute("data-lanes", "merged");
      await expect(row.getByRole("group")).toHaveCount(1);
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    for (const row of await rows.all()) {
      await expect(row).toHaveAttribute("data-lanes", "side-by-side");
    }
    expect(await page.evaluate(() => localStorage.getItem("aegis.battle-lanes"))).toBe("two");
    await scenario.healthy();
  });
}
