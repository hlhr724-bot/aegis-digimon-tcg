import fixture from "../../api/src/engine/scenarios/revealed-dual-option-uses-option-side.fixture";
import { test, expect } from "./scenario-page";

test("Gundramon uses the revealed DUAL Option without offering play or retaining it in hand", async ({ scenario }) => {
  const refs = await scenario.openFixture(fixture);
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await scenario.evolve("Gundramon", refs.permanentId("base"));
  let revealed = false;
  await scenario.resolveUntil(
    (state) =>
      !state.pendingDecision &&
      state.players[0]!.trash.some((card) => card.instanceId === refs.instanceId("revealedOption")),
    async (decision) => {
      expect(decision.options.choices ?? []).not.toContain("play");
      if (
        decision.kind === "selectCards" &&
        decision.options.candidateInstanceIds?.includes(refs.instanceId("revealedOption"))
      ) {
        revealed = true;
        await expect(
          scenario.page.getByRole("dialog").locator(`[data-instance-id="${refs.instanceId("revealedOption")}"]`),
        ).toBeEnabled();
        return { instanceId: refs.instanceId("revealedOption") };
      }
      return { accept: false };
    },
  );
  const state = await scenario.snapshot();
  expect(revealed).toBe(true);
  expect(state.players[0]!.hand.map((card) => card.instanceId)).not.toContain(refs.instanceId("revealedOption"));
  expect(
    state.players[1]!.battleArea.find((perm) => perm.permanentId === refs.permanentId("opponent"))?.topCard.cardId,
  ).toBe("BT1-009");
  expect(state.memory).toBe(6);
  await scenario.healthy();
});
