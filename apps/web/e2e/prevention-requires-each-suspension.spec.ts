import fixture from "@api-fixtures/prevention-requires-each-suspension.fixture";
import { fixtureInstanceId } from "../../api/src/engine/scenario/references";
import { expect, test } from "@playwright/test";
import { ScenarioPage } from "./scenario-page";
import { startBrowserServer } from "./server";

test("Neptunemon must suspend for every protection and leaves when it cannot pay again", async ({ page }) => {
  const server = await startBrowserServer({
    holdBotAllTurns: false,
    holdBotAfterTurn: 2,
    botMainIntents: [
      { type: "playCard", instanceId: fixtureInstanceId("removal1") },
      { type: "playCard", instanceId: fixtureInstanceId("removal2") },
      { type: "playCard", instanceId: fixtureInstanceId("removal3") },
      { type: "endPhase" },
    ],
  });
  const scenario = new ScenarioPage(page, server.useFixture);
  try {
    await scenario.openFixture(fixture);
    const prompts: string[] = [];
    await scenario.resolveUntil(
      (state) => state.players[0]!.trash.some((card) => card.cardId === "BT24-030") && !state.pendingDecision,
      async (decision) => {
        if (decision.kind === "optional" && decision.sourceCardId === "BT24-030") {
          prompts.push(decision.effectText ?? "");
        }
        return { accept: true };
      },
    );
    expect(prompts).toHaveLength(3);
    await expect(page.getByRole("button", { name: /^End turn$/i })).toBeEnabled();
    await scenario.healthy();
  } finally {
    await page.close();
    await server.close();
  }
});
