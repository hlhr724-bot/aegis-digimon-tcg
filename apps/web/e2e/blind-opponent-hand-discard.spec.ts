import fixture from "@api-fixtures/blind-opponent-hand-discard.fixture";
import { test, expect } from "@e2e/scenario-page";

test.use({ holdBotAfterTurn: 1 });

test("DanDevimon conceals every opponent hand card while choosing a discard", async ({ scenario, page }) => {
  await scenario.openFixture(fixture);
  await scenario.play("DanDevimon", "Digimon");
  let sawBlindDiscard = false;
  await scenario.resolveUntil(
    (state) => !state.pendingDecision && state.players[1]!.trash.length === 1,
    (decision) => {
      if (decision.kind === "selectCards" && decision.sourceCardId === "EX6-055") {
        sawBlindDiscard = true;
        expect(decision.options.visibleInstanceIds).toEqual([]);
        expect(decision.options.visibleCards ?? []).toEqual([]);
      }
      return {};
    },
  );
  expect(sawBlindDiscard).toBe(true);
  await expect(page.getByTestId("board-prompt")).toHaveCount(0);
  const final = await scenario.snapshot();
  expect(final.players[1]!.trash).toHaveLength(1);
  await scenario.healthy();
});
