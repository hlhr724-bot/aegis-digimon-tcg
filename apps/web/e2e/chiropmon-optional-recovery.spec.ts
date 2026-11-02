import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";
import { chiropmonOptionalRecovery } from "@api-fixtures/chiropmon-optional-recovery.fixture";

test.beforeEach(async ({ page }) => stubCardArtwork(page));

test("Chiropmon can pay its Tamer cost and decline the recovery", async ({ scenario }) => {
  const refs = await scenario.openFixture(chiropmonOptionalRecovery);
  await scenario.play("Chiropmon", "Digimon");
  let paid = false;
  let declined = false;
  await scenario.resolveUntil(
    (state) => declined && !state.pendingDecision,
    (decision) => {
      expect(decision.sourceCardId).toBe("ST23-12");
      if (decision.kind === "optional") {
        if (!paid) {
          paid = true;
          return { accept: true };
        }
        expect(decision.promptText).toContain("Return");
        declined = true;
        return { accept: false };
      }
      return {};
    },
  );
  const state = await scenario.snapshot();
  const player = state.players[0]!;
  expect(player.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("tamer"))!.stack).toEqual([]);
  expect(player.trash.map((card) => card.instanceId)).toEqual(
    expect.arrayContaining([refs.instanceId("payment"), refs.instanceId("recovery")]),
  );
  expect(player.hand.map((card) => card.cardId)).toEqual(["BT1-010"]);
  expect(state.memory).toBe(3);
  await scenario.healthy();
});
