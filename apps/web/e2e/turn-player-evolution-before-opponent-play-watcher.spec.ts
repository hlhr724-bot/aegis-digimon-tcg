import { expect } from "@playwright/test";
import { test } from "./scenario-page";
import fixture from "../../api/src/engine/scenarios/turn-player-evolution-before-opponent-play-watcher.fixture";

test.use({ botOptionalScript: { sourceCardId: "EX12-034", answers: [true] } });

test("evolves and removes the opponent watcher before it can return the attacking stack", async ({ scenario }) => {
  const references = await scenario.openFixture(fixture, "normal", "none");
  await scenario.evolve("Butenmon", references.permanentId("base"), true);
  let offeredEvolution = false;
  await scenario.resolveUntil(
    (state) =>
      state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT26-016") &&
      !state.pendingDecision &&
      !state.combatWindow,
    async (decision) => {
      if (decision.sourceCardId === "BT26-001") {
        offeredEvolution = true;
        const state = await scenario.snapshot();
        expect(state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX12-034")).toBe(true);
        return { cardId: "BT26-016" };
      }
      if (decision.kind === "orderTriggers") {
        return { triggerCardId: "BT26-015" };
      }
      if (decision.options.selectionContext === "attackTarget") {
        return { instanceId: "player" };
      }
      if (decision.kind === "chooseTargets") {
        return { cardId: decision.sourceCardId === "BT26-016" ? "EX12-034" : "TOKEN-Kotenken" };
      }
      if (decision.kind === "selectCards" && decision.sourceCardId === "BT26-015") {
        return { cardId: "BT1-009" };
      }
      return {};
    },
  );
  expect(offeredEvolution).toBe(true);
  const state = await scenario.snapshot();
  expect(state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX12-034")).toBe(false);
  const events = (await scenario.presentation()).events;
  expect(events.some((event) => event.kind === "cardPlayed" && event.cardId === "EX12-012")).toBe(true);
  expect(
    events.some(
      (event) => event.kind === "effectTriggered" && event.sourceCardId === "EX12-034" && event.timing === "whenPlayed",
    ),
  ).toBe(false);
  expect(events.some((event) => event.kind === "attackEnded")).toBe(true);
  await scenario.healthy();
});
