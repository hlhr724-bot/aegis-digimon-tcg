import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";
import { pyramidimonProcessingWithoutTarget } from "@api-fixtures/pyramidimon-processing-without-target.fixture";

test.beforeEach(async ({ page }) => stubCardArtwork(page));

test("Pyramidimon can trash its sources without an opposing battle-area Digimon", async ({ scenario }) => {
  const refs = await scenario.openFixture(pyramidimonProcessingWithoutTarget);
  await scenario.evolve("Pyramidimon", refs.permanentId("base"));
  await scenario.resolveUntil(
    (state) =>
      !state.pendingDecision && state.players[0]!.trash.some((card) => card.instanceId === refs.instanceId("rock")),
    (decision) =>
      decision.kind === "selectCards" ? { instanceIds: [refs.instanceId("base"), refs.instanceId("rock")] } : {},
  );
  const state = await scenario.snapshot();
  const player = state.players[0]!;
  expect(player.trash.map((card) => card.instanceId)).toEqual(
    expect.arrayContaining([refs.instanceId("base"), refs.instanceId("rock")]),
  );
  const evolved = player.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("base"))!;
  expect(evolved.topCard.cardId).toBe("EX10-033");
  expect(evolved.stack).toEqual([]);
  expect(state.players[1]!.breeding!.permanentId).toBe(refs.permanentId("opponentBreeding"));
  expect(state.memory).toBe(3);
  await scenario.healthy();
});
