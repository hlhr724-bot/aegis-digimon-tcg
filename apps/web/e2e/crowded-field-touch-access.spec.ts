import type { Locator, Page } from "@playwright/test";
import fixture from "@api-fixtures/crowded-field-touch-access.fixture";
import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";

type SwipeParams = { page: Page; card: Locator; distance: number };

async function swipeCard({ page, card, distance }: SwipeParams) {
  const bounds = await card.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds!.x + bounds!.width / 2;
  const y = bounds!.y + bounds!.height / 2;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 10; step++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - (distance * step) / 10, y }],
      });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await session.detach();
  }
}

async function isCardExposed(card: Locator) {
  return card.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  });
}

test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => stubCardArtwork(page));

for (const viewport of [
  { width: 844, height: 390 },
  { width: 390, height: 844 },
]) {
  test(`swipes a crowded field and attacks with its rightmost Digimon at ${viewport.width}px`, async ({
    scenario,
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Native touch swipes use Chromium CDP");
    await page.setViewportSize(viewport);
    const refs = await scenario.openFixture(fixture);
    const lane = page.getByRole("group", { name: "Your Digimon", exact: true });
    await expect.poll(() => lane.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(40);
    const start = page.locator(`[data-id="${refs.permanentId(viewport.width > 600 ? "attacker-5" : "attacker-2")}"]`);
    await swipeCard({ page, card: start, distance: 160 });
    await expect.poll(() => lane.evaluate((element) => element.scrollLeft)).toBeGreaterThan(40);
    await expect(page.getByRole("button", { name: "Attack", exact: true })).toHaveCount(0);
    const last = page.locator(`[data-id="${refs.permanentId("attacker-8")}"]`);
    for (let attempt = 0; attempt < 3 && !(await isCardExposed(last)); attempt++) {
      const visibleId = await lane.evaluate((element) => {
        const row = element.getBoundingClientRect();
        return [...element.querySelectorAll<HTMLElement>("[data-field-key]")]
          .filter((card) => {
            const bounds = card.getBoundingClientRect();
            const x = bounds.x + bounds.width / 2;
            return x > row.left + 44 && x < row.right - 44;
          })
          .at(-1)?.dataset.id;
      });
      expect(visibleId).toBeDefined();
      await swipeCard({ page, card: page.locator(`[data-id="${visibleId}"]`), distance: 160 });
    }
    await expect.poll(() => isCardExposed(last)).toBe(true);
    await last.tap();
    await page.getByRole("button", { name: "Attack", exact: true }).tap();
    await page.getByRole("button", { name: /^Opponent security/ }).tap();
    await scenario.resolveUntil(
      (state) =>
        state.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("attacker-8"))
          ?.isSuspended === true &&
        state.players[1]!.securityCount === 4 &&
        !state.pendingDecision &&
        !state.combatWindow,
    );
    await scenario.healthy();
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [390, 1440]) {
    test(`keeps crowded lane edges reachable with legacy flex alignment at ${width}px in ${colorScheme}`, async ({
      scenario,
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme });
      await page.addInitScript((dark) => localStorage.setItem("aegis:darkMode", String(dark)), colorScheme === "dark");
      const refs = await scenario.openFixture(fixture);
      const lane = page.getByRole("group", { name: "Your Digimon", exact: true });
      await lane.evaluate((element) => {
        if (getComputedStyle(element).justifyContent === "safe center") {
          element.style.justifyContent = "center";
        }
        element.scrollLeft = 0;
      });
      const first = page.locator(`[data-id="${refs.permanentId("attacker-1")}"]`);
      await expect.poll(() => isCardExposed(first)).toBe(true);
      await lane.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      const last = page.locator(`[data-id="${refs.permanentId("attacker-8")}"]`);
      await expect.poll(() => isCardExposed(last)).toBe(true);
      await scenario.healthy();
    });
  }
}
