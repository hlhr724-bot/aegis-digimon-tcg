import { expect, it } from "vitest";
import { setupEngine } from "#api/engine/testkit/harness";
import { trainingObservation } from "#api/bot/training/observation";
import type { TrainingWindow } from "#api/bot/training/policy";
import { orderMctsActions } from "#api/bot/evolution/orderMctsActions";
import { SEED_RESIDUAL } from "#api/bot/evolution/residualPolicy";

it("keeps the baseline first and stably ranks all alternatives without mutating the window", async () => {
  const setup = setupEngine({ 0: { hand: ["BT1-010", "BT1-011", "BT1-012"] } });
  await setup.ready();
  const observation = trainingObservation(setup.state, 0);
  const window: TrainingWindow = {
    observation,
    kind: "main",
    selected: [],
    actions: [
      { intent: { type: "endPhase" }, label: "Baseline" },
      ...observation.players[0]!.hand.map((card, index) => ({
        intent: { type: "playCard" as const, instanceId: card.instanceId },
        label: card.instanceId,
        projectedCost: [5, 2, 2][index],
      })),
    ],
  };
  const before = structuredClone(window);
  const ranked = orderMctsActions({
    window,
    program: {
      schemaVersion: 1,
      title: "Cost",
      rules: [{ feature: "cost", weight: -1, advice: "Prefer cheaper alternatives." }],
    },
  });
  expect(ranked.actions).toEqual([window.actions[0], window.actions[2], window.actions[3], window.actions[1]]);
  expect(window).toEqual(before);
  expect(ranked.observation).toBe(window.observation);
  expect(() => orderMctsActions({ window, program: SEED_RESIDUAL })).toThrow("standalone heuristic");
  expect(orderMctsActions({ window, program: { schemaVersion: 1, title: "Ties", rules: [] } }).actions).toEqual(
    window.actions,
  );
});
