import fixture from "../../api/src/engine/scenarios/yuu-amano-reduction-your-turn-only.fixture";
import { fixturePermanentId } from "../../api/src/engine/scenario/references";
import { test, expect } from "./scenario-page";

test.use({
  botMainIntents: [
    [
      {
        type: "attack",
        attackerPermanentId: fixturePermanentId("attacker"),
        target: { kind: "permanent", permanentId: fixturePermanentId("darkKnightmon") },
      },
      { type: "endPhase" },
    ],
    { scope: "test" },
  ],
});

test("Yuu Amano offers no cost reduction for a Digimon played during the opponent's turn", async ({ scenario }) => {
  const refs = await scenario.openFixture(fixture, "normal", "none");
  const prompts: string[] = [];
  await scenario.resolveUntil(
    (state) =>
      !state.pendingDecision &&
      !state.combatWindow &&
      state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === refs.instanceId("damemon")),
    (decision) => {
      prompts.push(decision.promptText ?? "");
      return { accept: true };
    },
    30_000,
  );

  expect(prompts.filter((prompt) => prompt.includes("BT10-093"))).toEqual([]);
  const own = (await scenario.snapshot()).players[0]!.battleArea;
  const yuu = own.find((permanent) => permanent.permanentId === refs.permanentId("yuu"))!;
  expect(yuu.stack.map((card) => card.instanceId)).toEqual([refs.instanceId("purpleUnderYuu")]);
  await scenario.healthy();
});
