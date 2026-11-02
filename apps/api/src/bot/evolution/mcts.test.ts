import { performance } from "node:perf_hooks";
import { describe, expect, it, vi } from "vitest";
import { setupEngine } from "../../engine/testkit/harness.js";
import { trainingObservation } from "../training/observation.js";
import type { TrainingWindow } from "../training/policy.js";
import { searchMcts } from "./mcts.js";
import { determinizeFromArchetypes } from "#api/bot/evolution/determinizeFromArchetypes";

describe("information-set MCTS", () => {
  it.each([false, true])(
    "counts a repeated position once per valid rollout with initial rejection %s",
    async (rejectFirst) => {
      const setup = setupEngine({});
      await setup.ready();
      const root: TrainingWindow = {
        observation: trainingObservation(setup.state, 0),
        kind: "main",
        selected: [],
        actions: [
          { intent: { type: "endPhase" }, label: "Pass" },
          { intent: { type: "hatchEgg" }, label: "Hatch" },
        ],
      };
      const result = await searchMcts({
        root,
        seat: 0,
        simulations: 4,
        exploration: 0,
        rolloutChoose: () => 0,
        simulate: async (choose, simulation) => {
          choose(root);
          choose(structuredClone(root));
          return { valid: !rejectFirst || simulation > 0, reward: 1 };
        },
      });
      expect(result.report.completed).toBe(4);
      expect(result.report.invalid).toBe(rejectFirst ? 1 : 0);
      expect(result.report.root.reduce((total, edge) => total + edge.visits, 0)).toBe(4);
    },
  );

  it("returns the best completed sample when the time budget expires between rollouts", async () => {
    const setup = setupEngine({});
    await setup.ready();
    const root: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "main",
      selected: [],
      actions: [
        { intent: { type: "endPhase" }, label: "Pass" },
        { intent: { type: "hatchEgg" }, label: "Hatch" },
      ],
    };
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    try {
      const result = await searchMcts({
        root,
        seat: 0,
        simulations: 128,
        maxDurationMs: 10,
        exploration: 0,
        rolloutChoose: () => 0,
        simulate: async (choose) => {
          const action = choose(root);
          now += 6;
          return { valid: true, reward: action === 1 ? 1 : 0 };
        },
      });
      expect(result.action).toBe(1);
      expect(result.report).toMatchObject({
        requested: 128,
        completed: 2,
        attempted: 2,
        invalid: 0,
        timeBudget: { requestedMs: 10, elapsedMs: 12, exhausted: true },
      });
    } finally {
      clock.mockRestore();
    }
  });

  it("does not turn an invalid rollout into a valid result when time expires", async () => {
    const setup = setupEngine({});
    await setup.ready();
    const root: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "main",
      selected: [],
      actions: [{ intent: { type: "endPhase" }, label: "Pass" }],
    };
    let now = 0;
    let attempts = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    try {
      await expect(
        searchMcts({
          root,
          seat: 0,
          simulations: 128,
          maxDurationMs: 10,
          rolloutChoose: () => 0,
          simulate: async (choose) => {
            attempts++;
            choose(root);
            now = 11;
            return { valid: false, reward: 1 };
          },
        }),
      ).rejects.toThrow("No valid MCTS rollouts");
      expect(attempts).toBe(1);
    } finally {
      clock.mockRestore();
    }
  });

  it("stops simulation work when an active search is cancelled", async () => {
    const setup = setupEngine({});
    await setup.ready();
    const root: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "main",
      selected: [],
      actions: [{ intent: { type: "endPhase" }, label: "Pass" }],
    };
    const controller = new AbortController();
    let calls = 0;
    await expect(
      searchMcts({
        root,
        seat: 0,
        simulations: 8,
        signal: controller.signal,
        rolloutChoose: () => 0,
        simulate: async (choose) => {
          calls++;
          choose(root);
          controller.abort(new Error("Search cancelled"));
          return { reward: 1, valid: true };
        },
      }),
    ).rejects.toThrow("Search cancelled");
    expect(calls).toBe(1);
  });

  it("uses exploration and backpropagation to prefer the winning branch", async () => {
    const setup = setupEngine({});
    await setup.ready();
    const root: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "main",
      selected: [],
      actions: [
        { intent: { type: "endPhase" }, label: "Lose" },
        { intent: { type: "hatchEgg" }, label: "Win" },
      ],
    };
    const result = await searchMcts({
      root,
      seat: 0,
      simulations: 128,
      rolloutChoose: () => 0,
      simulate: async (choose) => ({ reward: choose(root) === 1 ? 1 : 0, valid: true }),
    });
    expect(result.action).toBe(1);
    expect(result.report.completed).toBe(128);
    expect(result.report.invalid).toBe(0);
    expect(result.report.root.find((edge) => edge.action === 0)!.visits).toBeGreaterThan(0);
    expect(result.report.root[0]!.visits).toBeGreaterThan(100);
  });

  it("uses the Standard policy prior when the live search budget is smaller than the root branching factor", async () => {
    const setup = setupEngine({});
    await setup.ready();
    const root: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "main",
      selected: [],
      actions: [
        { intent: { type: "endPhase" }, label: "Fallback" },
        { intent: { type: "hatchEgg" }, label: "Prior" },
      ],
    };
    const result = await searchMcts({
      root,
      seat: 0,
      simulations: 1,
      rootPriors: [0.05, 0.95],
      rolloutChoose: () => 0,
      simulate: async (choose) => {
        expect(choose(root)).toBe(1);
        return { reward: 0.5, valid: true };
      },
    });
    expect(result.action).toBe(1);
  });

  it("does not count rejected rollouts as completed search", async () => {
    const setup = setupEngine({});
    await setup.ready();
    const root: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "main",
      selected: [],
      actions: [{ intent: { type: "endPhase" }, label: "Pass" }],
    };
    await expect(
      searchMcts({
        root,
        seat: 0,
        simulations: 2,
        rolloutChoose: () => 0,
        simulate: async (choose) => {
          choose(root);
          return { reward: 1, valid: false };
        },
      }),
    ).rejects.toThrow("No valid MCTS rollouts");
  });

  it("keeps archetype sampling independent of true hidden locations and preserves the observer's hand", async () => {
    const make = async () => {
      const setup = setupEngine(
        {
          0: { hand: ["BT1-010"], deck: ["BT1-011", "BT1-012"], security: ["BT1-013"] },
          1: { hand: ["BT1-027"], deck: ["BT1-028", "BT1-029"], security: ["BT1-030"] },
        },
        { fixtureIds: true },
      );
      await setup.ready();
      return setup;
    };
    const first = await make();
    const second = await make();
    for (const seat of [0, 1] as const) {
      const originals = [
        ...first.state.players[seat]!.hand,
        ...first.state.players[seat]!.deck,
        ...first.state.players[seat]!.security,
      ];
      for (const entry of [
        ...second.state.players[seat]!.hand,
        ...second.state.players[seat]!.deck,
        ...second.state.players[seat]!.security,
      ])
        entry.instanceId = originals.find((original) => original.cardId === entry.cardId)!.instanceId;
    }
    first.state.players[0]!.security[0]!.faceUp = true;
    second.state.players[0]!.security[0]!.faceUp = true;
    const hidden = second.state.players[1]!;
    const card = hidden.hand.shift()!;
    hidden.hand.push(hidden.deck.shift()!);
    hidden.deck.push(card);
    const ownHand = first.state.players[0]!.hand[0]!.instanceId;
    expect(
      [...first.state.players[1]!.hand, ...first.state.players[1]!.deck, ...first.state.players[1]!.security]
        .map((entry) => entry.instanceId)
        .sort(),
    ).toEqual(
      [...second.state.players[1]!.hand, ...second.state.players[1]!.deck, ...second.state.players[1]!.security]
        .map((entry) => entry.instanceId)
        .sort(),
    );
    await determinizeFromArchetypes({ engine: first.engine, observer: 0, seed: 917 });
    await determinizeFromArchetypes({ engine: second.engine, observer: 0, seed: 917 });
    expect(trainingObservation(first.state, 0)).toEqual(trainingObservation(second.state, 0));
    expect(first.state.players[0]!.hand[0]!.instanceId).toBe(ownHand);
    expect(first.state.players[0]!.security[0]!.faceUp).toBe(true);
    expect(first.state.players[1]!.hand).toHaveLength(1);
    expect(first.state.players[1]!.deck).toHaveLength(2);
    expect(first.state.players[1]!.security).toHaveLength(1);
  });
});
