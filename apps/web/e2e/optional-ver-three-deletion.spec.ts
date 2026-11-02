import fixture from "../../api/src/engine/scenarios/optional-ver-three-deletion.fixture";
import { test, expect } from "./scenario-page";

test("Giromon can place a face-down source and decline the separate deletion", async ({ scenario }) => {
  const refs = await scenario.openFixture(fixture, "normal", "none");
  await scenario.play("Giromon", "Digimon");
  const optionalClauses: string[] = [];
  await scenario.resolveUntil(
    (state) =>
      state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === refs.instanceId("giromon") && permanent.stack.length === 1,
      ) && !state.pendingDecision,
    (decision) => {
      if (decision.kind === "optional") {
        const clause = decision.options.effectTextPart ?? "";
        optionalClauses.push(clause);
        return { accept: !clause.startsWith("Then,") };
      }
      return { instanceId: refs.instanceId("material") };
    },
  );
  const state = await scenario.snapshot();
  expect(optionalClauses).toHaveLength(2);
  expect(optionalClauses[1]).toContain("Then, you may delete");
  expect(state.players[0]!.battleArea).toHaveLength(2);
  expect(state.players[1]!.battleArea).toHaveLength(1);
  expect(
    state.players[0]!.battleArea.find((permanent) => permanent.topCard.instanceId === refs.instanceId("giromon"))!
      .stack[0],
  ).toMatchObject({ instanceId: refs.instanceId("material"), faceUp: false });
  await scenario.healthy();
});
