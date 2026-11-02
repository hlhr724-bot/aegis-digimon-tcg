import fixture from "../../api/src/engine/scenarios/succession-renews-replacement-budget.fixture";
import { test, expect } from "./scenario-page";

test.use({ holdBotAfterTurn: 1 });

test("Wrath Mode offers its gained protection after Jupitermon already paid to prevent Kaguyamon", async ({
  scenario,
}) => {
  const refs = await scenario.openFixture(fixture);
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await scenario.evolve("Jupitermon", refs.permanentId("base"));
  let protections = 0;
  await scenario.resolveUntil(
    (state) =>
      state.players[0]!.securityCount === 1 &&
      state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX12-065") &&
      !state.pendingDecision,
    (decision) => {
      if (decision.kind === "optional" && decision.promptText.includes("Prevent leaving")) {
        protections += 1;
        return { accept: true, decisionBudgetMs: 15_000 };
      }
      return { accept: true };
    },
  );
  expect(protections).toBe(1);
  await scenario.evolve("Jupitermon: Wrath Mode", refs.permanentId("base"), true);
  await scenario.resolveUntil(
    (state) =>
      state.players[1]!.battleArea.length === 0 && state.players[0]!.securityCount === 2 && !state.pendingDecision,
    (decision) => {
      if (decision.kind === "optional" && decision.promptText.includes("Prevent leaving")) {
        protections += 1;
        return { accept: true, decisionBudgetMs: 15_000 };
      }
      return { accept: true };
    },
  );
  expect(protections).toBe(2);
  const state = await scenario.snapshot();
  expect(
    state.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("base"))?.topCard
      .cardId,
  ).toBe("BT26-103");
  expect(state.players[1]!.trash.some((card) => card.cardId === "EX12-065")).toBe(true);
  await scenario.healthy();
});
