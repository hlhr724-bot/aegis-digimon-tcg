import { describe, expect, it } from "vitest";
import { setupEngine } from "#api/engine/testkit/harness";
import { trainingObservation } from "#api/bot/training/observation";
import type { TrainingWindow } from "#api/bot/training/policy";
import { searchMcts } from "#api/bot/evolution/mcts";

async function createRoot(): Promise<TrainingWindow> {
  const setup = setupEngine({});
  await setup.ready();
  return {
    observation: trainingObservation(setup.state, 0),
    kind: "main",
    selected: [],
    actions: [
      { intent: { type: "endPhase" }, label: "Pass" },
      { intent: { type: "hatchEgg" }, label: "Hatch" },
      { intent: { type: "playCard", instanceId: "a" }, label: "Play a" },
      { intent: { type: "playCard", instanceId: "b" }, label: "Play b" },
      { intent: { type: "playCard", instanceId: "c" }, label: "Play c" },
      { intent: { type: "playCard", instanceId: "d" }, label: "Play d" },
    ],
  };
}

async function searchWithWidening(root: TrainingWindow, coefficient: number, exponent: number) {
  return searchMcts({
    root,
    seat: 0,
    simulations: 8,
    exploration: 0,
    rootWidening: { coefficient, exponent },
    rolloutChoose: () => 0,
    simulate: async (choose) => {
      const action = choose(root);
      return { valid: true, reward: action === 5 ? 1 : 0.5 };
    },
  });
}

describe("MCTS root widening", () => {
  it("keeps the search on the leading ordered actions while the root has few visits", async () => {
    const root = await createRoot();
    const result = await searchWithWidening(root, 2, 0.5);
    const visited = result.report.root.filter((edge) => edge.visits > 0).map((edge) => edge.action);
    expect([...visited].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(result.report.root.reduce((total, edge) => total + edge.visits, 0)).toBe(8);
  });

  it("searches only the first action when widening never grows", async () => {
    const root = await createRoot();
    const result = await searchWithWidening(root, 1, 0);
    expect(result.action).toBe(0);
    expect(result.report.root.find((edge) => edge.action === 0)?.visits).toBe(8);
  });

  it("reaches every action once enough visits have accumulated", async () => {
    const root = await createRoot();
    const result = await searchWithWidening(root, 3, 1);
    expect(result.action).toBe(5);
    expect(result.report.root.every((edge) => edge.visits > 0)).toBe(true);
  });

  it.each([
    { coefficient: 0.5, exponent: 0.5 },
    { coefficient: 2, exponent: -1 },
    { coefficient: 2, exponent: 2 },
    { coefficient: Number.NaN, exponent: 0.5 },
  ])("rejects widening coefficient $coefficient with exponent $exponent", async ({ coefficient, exponent }) => {
    const root = await createRoot();
    await expect(searchWithWidening(root, coefficient, exponent)).rejects.toThrow("Invalid MCTS root widening");
  });
});
