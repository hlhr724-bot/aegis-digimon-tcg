import fixture from "@api-fixtures/start-turn-search-hand-presentation.fixture";
import { test, expect } from "@e2e/scenario-page";

test("shows start-of-turn search results before the opponent's hand discard and normal draw", async ({ scenario }) => {
  const refs = await scenario.openFixture(fixture, "normal", "none");
  await scenario.resolveUntil(
    (state) => state.phase === "Breeding" && !state.pendingDecision,
    async (decision) => {
      if (decision.kind === "selectCards" && decision.sourceCardId === "LM-029") {
        const recycled = refs.instanceId("recycled-taomon");
        const candidates = decision.options.candidateInstanceIds ?? [];
        return { instanceId: candidates.includes(recycled) ? recycled : refs.instanceId("searching-renamon") };
      }
      if (decision.kind === "selectCards" && decision.sourceCardId === "BT17-031") {
        const taomon = refs.instanceId("recycled-taomon");
        const candidates = decision.options.candidateInstanceIds ?? [];
        return { instanceId: candidates.includes(taomon) ? taomon : refs.instanceId("searched-rika") };
      }
      if (decision.kind === "selectCards" && decision.sourceCardId === "BT26-079") {
        const hand = scenario.page.getByTestId("hand");
        await expect(hand.locator(`[data-hand-instance-id="${refs.instanceId("recycled-taomon")}"]`)).toBeVisible();
        await expect(hand.locator(`[data-hand-instance-id="${refs.instanceId("searched-rika")}"]`)).toBeVisible();
        await expect(hand.locator(`[data-hand-instance-id="${refs.instanceId("normal-draw")}"]`)).toHaveCount(0);
        return { instanceId: refs.instanceId("discarded-renamon") };
      }
      return { accept: true };
    },
  );
  const state = await scenario.snapshot();
  expect(state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
    ["kept-kyubimon", "kept-sakuyamon", "recycled-taomon", "searched-rika", "normal-draw"].map(refs.instanceId),
  );
  const hand = scenario.page.getByTestId("hand");
  await expect(hand.locator(`[data-hand-instance-id="${refs.instanceId("discarded-renamon")}"]`)).toHaveCount(0);
  await expect(hand.locator(`[data-hand-instance-id="${refs.instanceId("normal-draw")}"]`)).toBeVisible();
  await scenario.healthy();
});
