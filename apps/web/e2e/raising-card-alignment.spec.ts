import fixture from "@api-fixtures/raising-card-alignment.fixture";
import { stubCardArtwork } from "@e2e/card-artwork";
import { expect, test } from "@e2e/scenario-page";

const boards = [
  { width: 1536, height: 864, colorScheme: "light" },
  { width: 1280, height: 720, colorScheme: "dark" },
  { width: 390, height: 844, colorScheme: "light" },
  { width: 390, height: 844, colorScheme: "dark" },
] as const;

const stacks = [
  { side: "you", sourceCount: 1 },
  { side: "opp", sourceCount: 3 },
] as const;

for (const { width, height, colorScheme } of boards) {
  test(`keeps both raising cards centered at ${width}x${height} in ${colorScheme} mode`, async ({ scenario, page }) => {
    await stubCardArtwork(page);
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width, height });
    await scenario.openFixture(fixture);
    await scenario.idle();

    for (const { side, sourceCount } of stacks) {
      const frame = page.locator(`.game-utility-slot--${side}-raising`);
      const slot = frame.locator(".game-breeding-slot__box");
      const card = slot.locator('.game-card-enter > [data-state="active"]');
      await expect(card).toBeVisible();
      await expect(slot.locator(".game-permanent__source")).toHaveCount(sourceCount);
      await expect(slot.locator(".game-source-badge")).toBeVisible();
      await expect
        .poll(() =>
          card.evaluate((element) => {
            const face = element.getBoundingClientRect();
            const box = element.closest(".game-breeding-slot__box")!.getBoundingClientRect();
            const border = element.closest(".game-utility-slot")!.getBoundingClientRect();
            const centerOffset = Math.abs((face.left + face.right - box.left - box.right) / 2);
            return Math.max(centerOffset, border.left - face.left, face.right - border.right);
          }),
        )
        .toBeLessThanOrEqual(1);
    }
  });
}
