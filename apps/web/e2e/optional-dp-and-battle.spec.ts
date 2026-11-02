import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";
import fixture from "@api-fixtures/optional-dp-and-battle.fixture";

test.beforeEach(async ({ page }) => stubCardArtwork(page));

test("declining Diarbbitmon's buff preserves the opponent while the attack completes", async ({ scenario }) => {
  const refs = await scenario.openFixture(fixture);
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await scenario.attack(refs.permanentId("attacker"));
  let optionalPrompts = 0;
  await scenario.resolveUntil(
    (state) => state.players[1]!.securityCount === 0 && !state.combatWindow && !state.pendingDecision,
    async (decision) => {
      if (decision.kind === "optional" && decision.sourceCardId === "EX12-052") {
        optionalPrompts += 1;
        return { accept: false };
      }
      return {};
    },
  );
  const after = await scenario.snapshot();
  expect(optionalPrompts).toBe(1);
  expect(after.players[0]!.battleArea.find((p) => p.permanentId === refs.permanentId("attacker"))!.currentDP).toBe(
    12000,
  );
  expect(after.players[1]!.battleArea.map((p) => p.permanentId)).toContain(refs.permanentId("opponent"));
  await scenario.healthy();
});
