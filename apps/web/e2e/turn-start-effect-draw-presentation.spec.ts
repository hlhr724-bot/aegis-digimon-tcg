import fixture from "../../api/src/engine/scenarios/turn-start-effect-draw-presentation.fixture";
import { test, expect } from "@playwright/test";
import { openFixturePage } from "./scenario-page";
import { startBrowserServer } from "./server";

// A start-of-turn effect draw is presented by its own event; the Draw phase must fly only its own card.
test("a start-of-turn effect draw is not presented again as the turn draw", async ({ page }) => {
  const server = await startBrowserServer({ holdBotAllTurns: false });
  try {
    await page.addInitScript(() => {
      const globals = window as unknown as { viewerHandCountTrace: number[] };
      globals.viewerHandCountTrace = [];
      const sample = () => {
        const count = document.querySelectorAll('[data-testid="hand"] [aria-label^="Select "]').length;
        if (globals.viewerHandCountTrace.at(-1) !== count) globals.viewerHandCountTrace.push(count);
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await openFixturePage(page, fixture);
    const endTurn = page.getByRole("button", { name: /^end turn$/i });
    await expect(endTurn).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.browserTestPresentation().idle)).toBe(true);
    const mark = await page.evaluate(() => {
      (window as unknown as { viewerHandCountTrace: number[] }).viewerHandCountTrace = [];
      return {
        steps: window.browserTestPresentation().steps.length,
        hand: window.browserTestSnapshot().players[0]!.handCount,
      };
    });
    expect(mark.hand).toBe(2);

    await endTurn.click();
    await expect.poll(() => page.evaluate(() => window.browserTestSnapshot().turnCount)).toBe(3);
    await expect(endTurn).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.browserTestPresentation().idle)).toBe(true);

    const result = await page.evaluate((stepsBefore) => {
      const flights = window
        .browserTestPresentation()
        .steps.slice(stepsBefore)
        .filter((step) => step.id.startsWith("draw-flight-") && step.phase === "started");
      return {
        hand: window.browserTestSnapshot().players[0]!.handCount,
        effectDrawFlights: flights.filter((step) => step.track.startsWith("drawFlight-")).length,
        turnDrawFlights: flights.filter((step) => step.track.startsWith("turnDrawFlight-")).length,
        viewerHandCounts: (window as unknown as { viewerHandCountTrace: number[] }).viewerHandCountTrace,
      };
    }, mark.steps);
    expect(result.hand).toBe(4);
    expect(result.effectDrawFlights).toBe(1);
    // One turn draw each: the opponent's turn 2, then the viewer's turn 3.
    expect(result.turnDrawFlights).toBe(2);
    expect(result.viewerHandCounts).toEqual([2, 3, 4]);
  } finally {
    await page.close();
    await server.close();
  }
});
