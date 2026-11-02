import { test, expect, type Page } from "@playwright/test";
import { BLUE_DECK, RED_DECK } from "../../api/dist/engine/testDecks.js";
import { ScenarioPage } from "./scenario-page";
import { startBrowserServer } from "./server";

async function prepare(page: Page, requestedSeat: number, requestedSeed: number, requestedKingSeat: number) {
  await page.addInitScript(
    ({ seat, seed, kingSeat, blue, red }) => {
      localStorage.setItem("aegis:locale", "en");
      localStorage.setItem("aegis.effect-speed", "normal");
      localStorage.setItem("aegis.action-confirmation.enabled", "false");
      localStorage.setItem("aegis.breeding.auto-hatch", "false");
      window.browserTestOptions = {
        displayName: `Feedback 61 seat ${seat}`,
        seed,
        deck:
          seat === kingSeat
            ? { mainDeck: blue.mainDeck, eggDeck: ["BT13-007", "BT13-007", "BT13-007", "BT13-007"] }
            : { mainDeck: red.mainDeck, eggDeck: ["BT18-004", "BT18-004", "BT18-004", "BT18-004"] },
      };
    },
    { seat: requestedSeat, seed: requestedSeed, kingSeat: requestedKingSeat, blue: BLUE_DECK, red: RED_DECK },
  );
}

for (const kingSeat of [1, 0]) {
  test(`Feedback #61: initial mulligan security flights release King Drasil's hatch controls in seat ${kingSeat}`, async ({
    page,
    browser,
  }, info) => {
    const server = await startBrowserServer();
    const otherContext = await browser.newContext({
      viewport: kingSeat === 1 ? { width: 1366, height: 900 } : { width: 390, height: 844 },
    });
    const otherPage = await otherContext.newPage();
    await page.setViewportSize(kingSeat === 1 ? { width: 390, height: 844 } : { width: 1366, height: 900 });
    const first = new ScenarioPage(page);
    const second = new ScenarioPage(otherPage);
    const views = [first, second];
    const king = views[kingSeat]!;
    const opponent = views[1 - kingSeat]!;
    try {
      const seed = kingSeat === 1 ? 1 : 2;
      await prepare(page, 0, seed, kingSeat);
      await prepare(otherPage, 1, seed, kingSeat);
      await page.goto("/e2e/harness.html");
      await expect(page.getByText(/finding an opponent/i)).toBeVisible();
      await otherPage.goto("/e2e/harness.html");
      await king.page.getByRole("button", { name: /keep hand/i }).click();
      await opponent.page.getByRole("button", { name: "Mulligan", exact: true }).click();
      await expect.poll(async () => (await king.snapshot()).phase).toBe("Breeding");
      const before = await king.snapshot();
      expect(before.turnSeat).toBe(kingSeat);
      expect(before.players[kingSeat]!.eggDeckCount).toBe(4);
      expect(before.players[kingSeat]!.breeding).toBeUndefined();
      const eggs = king.page.locator(".game-utility-slot--you-eggs");
      await expect(eggs).toHaveClass(/game-egg-deck--hatchable/, { timeout: 15_000 });
      await king.idle();
      await opponent.idle();
      for (const view of views) {
        const snapshot = await view.snapshot();
        const seat = snapshot.players.findIndex((player) => Array.isArray(player.hand));
        const expectedIds = snapshot.players[seat]!.hand.map((card) => card.instanceId).sort();
        await expect
          .poll(() =>
            view.page
              .getByTestId("hand")
              .locator("[data-hand-instance-id]")
              .evaluateAll((cards) => cards.map((card) => (card as HTMLElement).dataset.handInstanceId).sort()),
          )
          .toEqual(expectedIds);
      }
      await eggs.click();
      await king.resolveUntil((s) => s.phase === "Main" && !s.pendingDecision);
      const after = await king.snapshot();
      const player = after.players[kingSeat]!;
      expect(player.breeding!.topCard.cardId).toBe("BT13-007");
      expect(player.breeding!.inBreeding).toBe(true);
      expect(player.breeding!.stack.map((c) => c.cardId)).toEqual(["BT13-007"]);
      expect(player.eggDeckCount).toBe(2);
      expect(player.hand).toHaveLength(5);
      expect(after.memory).toBe(before.memory);
      expect(after.turnSeat).toBe(kingSeat);
      expect(after.players[1 - kingSeat]!.eggDeckCount).toBe(4);
      const { events } = await king.presentation();
      expect(events.filter((event) => event.kind === "hatched")).toHaveLength(1);
      await king.healthy();
      await opponent.healthy();
    } finally {
      for (const [seat, view] of views.entries()) {
        const evidence = await view.page.evaluate(() => ({
          presentation:
            typeof window.browserTestPresentation === "function" ? window.browserTestPresentation() : undefined,
          snapshot: typeof window.browserTestSnapshot === "function" ? window.browserTestSnapshot() : undefined,
        }));
        await info.attach(`seat-${seat}-presentation`, {
          body: JSON.stringify(evidence),
          contentType: "application/json",
        });
      }
      await otherContext.close();
      await page.close();
      await server.close();
    }
  });
}
