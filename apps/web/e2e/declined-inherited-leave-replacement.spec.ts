import fixture from "@api-fixtures/declined-inherited-leave-replacement.fixture";
import { fixturePermanentId } from "../../api/src/engine/scenario/references";
import { expect, test } from "@playwright/test";
import { ScenarioPage } from "./scenario-page";
import { startBrowserServer } from "./server";

test("declined inherited effects remain available during the opponent's next attack", async ({ page }) => {
  const server = await startBrowserServer({
    holdBotAllTurns: false,
    holdBotAfterTurn: 2,
    botMainIntents: [
      {
        type: "attack",
        attackerPermanentId: fixturePermanentId("first-attacker"),
        target: { kind: "permanent", permanentId: fixturePermanentId("first-victim") },
      },
      {
        type: "attack",
        attackerPermanentId: fixturePermanentId("second-attacker"),
        target: { kind: "permanent", permanentId: fixturePermanentId("second-victim") },
      },
      { type: "endPhase" },
    ],
  });
  const scenario = new ScenarioPage(page, server.useFixture);
  try {
    await scenario.openFixture(fixture);
    const declinedSources: string[] = [];
    await scenario.resolveUntil(
      (state) => state.players[0]!.trash.length === 2 && !state.pendingDecision,
      async (decision) => {
        if (decision.kind === "optional" && decision.sourceCardId === "BT22-007") {
          declinedSources.push(decision.sourceInstanceId!);
        }
        return { accept: false };
      },
    );
    expect(declinedSources).toHaveLength(4);
    expect(new Set(declinedSources).size).toBe(2);
    await expect(page.getByRole("button", { name: /^End breeding$/i })).toBeEnabled();
    await scenario.healthy();
  } finally {
    await page.close();
    await server.close();
  }
});
