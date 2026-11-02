import fixture from "@api-fixtures/coredramon-cost-after-start-main-evolution.fixture";
import { test, expect } from "@playwright/test";
import { ScenarioPage } from "@e2e/scenario-page";
import { startBrowserServer } from "@e2e/server";
import { stubCardArtwork } from "@e2e/card-artwork";

test("resumes Coredramon's hand cost after reconnecting during its start-of-main evolution", async ({ page }, info) => {
  const server = await startBrowserServer({ holdBotAfterTurn: 2 });
  const scenario = new ScenarioPage(page, server.useFixture);
  try {
    await stubCardArtwork(page);
    const refs = await scenario.openFixture(fixture, "normal", "move");
    await scenario.resolveUntil(
      (state) => state.pendingDecision?.promptText === "Coredramon" && state.pendingDecision.kind === "selectCards",
      () => ({ cardId: "EX13-018", accept: true }),
    );
    const before = await scenario.snapshot();
    const decisionId = before.pendingDecision!.decisionId;
    const room = await page.evaluate(() => JSON.parse(sessionStorage.getItem("aegis:matchSession")!).roomId);
    await expect(page.getByRole("button", { name: /^(End Selection|Confirm targets)$/i })).toBeVisible();
    const errorsBeforeOutage = scenario.errors.length;
    await server.edge.stop();
    await expect(page.getByText("Reconnecting…")).toBeVisible();
    await server.edge.start();
    await expect(page.getByText("Reconnecting…")).toHaveCount(0);
    const outageErrors = scenario.errors.splice(errorsBeforeOutage);
    expect(outageErrors.every((message) => message === "Failed to load resource: net::ERR_CONNECTION_REFUSED")).toBe(
      true,
    );
    await expect.poll(async () => (await scenario.snapshot()).pendingDecision?.decisionId).toBe(decisionId);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("aegis:matchSession")!).roomId)).toBe(room);
    await scenario.resolveUntil(
      (state) =>
        state.players[0]!.trash.some(({ instanceId }) => instanceId === refs.instanceId("cost")) &&
        !state.pendingDecision,
      (decision) =>
        decision.sourceCardId === "EX13-018" ? { instanceId: refs.instanceId("cost") } : { accept: false },
    );
    const after = await scenario.snapshot();
    expect(after.players[0]!.handCount).toBe(before.players[0]!.handCount + 1);
    expect(
      after.players[0]!.battleArea.find(({ permanentId }) => permanentId === refs.permanentId("dracomon"))?.topCard
        .cardId,
    ).toBe("EX13-018");
    await scenario.healthy();
  } finally {
    await scenario.evidence(info);
    await page.close();
    await server.close();
  }
});
