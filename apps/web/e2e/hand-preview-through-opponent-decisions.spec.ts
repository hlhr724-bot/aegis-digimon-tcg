import { fixturePermanentId } from "../../api/src/engine/scenario/references";
import fixtureSecurityChain from "../../api/src/engine/scenarios/security-chain.fixture";
import { expect, test } from "@playwright/test";
import { ScenarioPage } from "./scenario-page";
import { startBrowserServer } from "./server";

test("an enlarged hand card stays open while the opponent answers a chained decision", async ({ page }) => {
  const server = await startBrowserServer({
    botMainIntents: [
      { type: "attack", attackerPermanentId: fixturePermanentId("opponent"), target: { kind: "player" } },
      { type: "endPhase" },
    ],
    holdBotAfterTurn: 2,
  });
  const scenario = new ScenarioPage(page, server.useFixture);
  try {
    await scenario.openFixture(fixtureSecurityChain);
    await expect.poll(() => server.pendingBotDecision()?.kind).toBe("optional");
    const firstDecision = server.pendingBotDecision()!.decisionId;
    const card = page
      .getByTestId("hand")
      .getByRole("button", { name: /^Select / })
      .first();
    await card.focus();
    await card.press("Enter");
    await page.getByRole("button", { name: "Enlarge card", exact: true }).click();
    const zoom = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(zoom).toBeVisible();

    server.releaseBotDecision();
    await expect.poll(() => server.pendingBotDecision()?.decisionId).not.toBe(firstDecision);
    await expect.poll(() => server.pendingBotDecision()?.kind).toBe("selectCards");
    await expect(zoom).toBeVisible();
    server.releaseBotDecision();
    await expect.poll(async () => (await scenario.snapshot()).pendingDecision).toBeUndefined();
    await expect(zoom).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(zoom).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^End breeding$/i })).toBeEnabled();
    await scenario.healthy();
  } finally {
    await page.close();
    await server.close();
  }
});
