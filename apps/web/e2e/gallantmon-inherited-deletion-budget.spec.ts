import fixture from "../../api/src/engine/scenarios/gallantmon-inherited-deletion-budget.fixture";
import { test, expect } from "./scenario-page";

test("Growlmon raises Gallantmon's deletion budget and WarGrowlmon trashes security once", async ({ scenario }) => {
  const refs = await scenario.openFixture(fixture, "normal", "none");
  await scenario.evolve("Gallantmon", refs.permanentId("evolution-base"), true);
  await scenario.resolveUntil(
    (state) => state.players[1]!.battleArea.length === 0 && !state.pendingDecision && !state.combatWindow,
    (decision) => ({ accept: !decision.promptText.includes("Attack with this Digimon") }),
  );
  const budget = (await scenario.presentation()).decisions.find(
    (decision) => decision.options?.maxTotalDP !== undefined,
  );
  expect(budget?.options?.maxTotalDP).toBe(12000);
  expect(budget?.options?.candidateInstanceIds).toEqual([refs.permanentId("twelve-thousand")]);
  expect((await scenario.snapshot()).players[1]!.securityCount).toBe(2);
  await scenario.healthy();
});
