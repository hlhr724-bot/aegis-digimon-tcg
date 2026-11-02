import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { mainActions } from "../training/actions.js";
import { trainingObservation } from "../training/observation.js";
import type { TrainingWindow } from "../training/policy.js";
import { actionFeatures, chooseHeuristic, parseHeuristic, SEED_HEURISTIC } from "./heuristic.js";
import "../../cards/index.js";

describe("evolved heuristic interpreter", () => {
  it.each([3, 4, 5, 6, 7])("preserves a residual breeding deployment level of %s", (breedingDeployLevel) => {
    const program = parseHeuristic({ ...SEED_HEURISTIC, basePolicy: "projected-balanced", breedingDeployLevel });
    expect(program).toHaveProperty("breedingDeployLevel", breedingDeployLevel);
    expect(parseHeuristic(JSON.parse(JSON.stringify(program)))).toEqual(program);
    expect(parseHeuristic(SEED_HEURISTIC)).not.toHaveProperty("breedingDeployLevel");
  });

  it.each([null, 2, 8, 3.5, "3", NaN, Infinity])(
    "rejects an invalid breeding deployment level %s",
    (breedingDeployLevel) => {
      expect(() =>
        parseHeuristic({ ...SEED_HEURISTIC, basePolicy: "projected-balanced", breedingDeployLevel }),
      ).toThrow("Invalid breeding deployment level");
    },
  );

  it("requires a residual base for a breeding deployment override", () => {
    expect(() => parseHeuristic({ ...SEED_HEURISTIC, breedingDeployLevel: 3 })).toThrow(
      "Invalid breeding deployment level",
    );
  });

  it("counts and executes the actual Assembly materials for learned preferences", async () => {
    const setup = setupEngine(
      { 0: { hand: ["EX9-055"], trash: Array(4).fill("EX9-005") } },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    setup.state.memory = 0;
    await setup.ready();
    const window: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "main",
      selected: [],
      actions: mainActions(setup.engine, 0),
    };
    const index = window.actions.findIndex((action) => action.intent.type === "playCard" && action.intent.assembly);
    const action = window.actions[index]!;
    expect(actionFeatures(window, index).materials).toBe(4);
    expect(setup.engine.applyIntent(0, action.intent)).toEqual({ ok: true });
    await settle(() => setup.state.players[0]!.battleArea.some((unit) => unit.topCard.cardId === "EX9-055"));
    expect(setup.state.players[0]!.battleArea[0]!.stack).toHaveLength(4);
    expect(setup.state.players[0]!.trash).toHaveLength(0);
    expect(setup.events.filter((event) => event.kind === "actionRejected")).toEqual([]);
  });
  it("applies a deck-specific preference only in its declared context", async () => {
    const setup = setupEngine({ 0: { hand: ["BT1-010", "BT1-011"] } });
    await setup.ready();
    const window: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "main",
      selected: [],
      actions: mainActions(setup.engine, 0),
    };
    const program = parseHeuristic({
      schemaVersion: 1,
      title: "Conditional pilot",
      rules: [
        {
          feature: "bias",
          weight: 10,
          advice: "Prioritize this rookie when affordable.",
          when: { kind: "main", sourceCardIds: ["BT1-010"], maximum: { cost: 3 } },
        },
      ],
    });
    const choice = window.actions[chooseHeuristic(program, window)]!;
    expect(choice.sourceId).toBe(setup.state.players[0]!.hand.find((card) => card.cardId === "BT1-010")!.instanceId);
    expect(window.actions[chooseHeuristic(program, { ...window, kind: "different" })]).toBeDefined();
  });
  it("replays seeded tie choices and distributes equal scores beyond the first action", async () => {
    const setup = setupEngine({ 0: { hand: ["BT1-010", "BT1-011"] } });
    await setup.ready();
    const window: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "main",
      selected: [],
      actions: mainActions(setup.engine, 0),
    };
    const program = parseHeuristic({
      schemaVersion: 1,
      title: "Ties",
      rules: [{ feature: "bias", weight: 0, advice: "No preference." }],
    });
    const choices = Array.from({ length: 100 }, (_, seed) => chooseHeuristic(program, window, seed));
    expect(choices).toEqual(Array.from({ length: 100 }, (_, seed) => chooseHeuristic(program, window, seed)));
    expect(new Set(choices).size).toBeGreaterThan(1);
    expect(choices.every((choice) => choice >= 0 && choice < window.actions.length)).toBe(true);
  });
  it("uses public hand and trash counts for conditional rules without revealing the opposing hand", async () => {
    const setup = setupEngine({ 0: { hand: ["BT1-010"], trash: ["BT1-011"] }, 1: { hand: ["BT1-010", "BT1-011"] } });
    await setup.ready();
    const window: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "main",
      selected: [],
      actions: mainActions(setup.engine, 0),
    };
    const features = actionFeatures(window, 0);
    expect(features.ownHandCount).toBe(window.observation.players[0]!.handCount);
    expect(features.opponentHandCount).toBe(window.observation.players[1]!.handCount);
    expect(window.observation.players[1]!.hand).toEqual([]);
    expect(features.ownTrashCount).toBe(1);
    expect(features.opponentTrashCount).toBe(0);
    expect(features.turn).toBe(window.observation.turn);
  });
  it("rejects unknown features, nonfinite weights, and missing guide text", () => {
    for (const rule of [
      { feature: "readOpponentHand", weight: 1, advice: "Cheat" },
      { feature: "cost", weight: Infinity, advice: "Invalid" },
      { feature: "cost", weight: 1, advice: "" },
    ])
      expect(() => parseHeuristic({ schemaVersion: 1, title: "Pilot", rules: [rule] })).toThrow(
        "Invalid heuristic rule",
      );
    expect(parseHeuristic(SEED_HEURISTIC)).toEqual(SEED_HEURISTIC);
  });

  it("chooses the available winning attack through the real engine action surface", async () => {
    const setup = setupEngine({
      0: { battleArea: [{ card: "BT1-025", as: "attacker" }], hand: ["BT1-010"] },
      1: { security: [] },
    });
    await setup.ready();
    const window: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "main",
      selected: [],
      actions: mainActions(setup.engine, 0),
    };
    for (let index = 0; index < window.actions.length; index++)
      expect(Object.values(actionFeatures(window, index)).every(Number.isFinite)).toBe(true);
    const action = window.actions[chooseHeuristic(SEED_HEURISTIC, window)]!;
    expect(action.intent.type).toBe("attack");
    expect(setup.engine.applyIntent(0, action.intent)).toEqual({ ok: true });
  });

  it("accounts for memory handover and uses public card metadata for plays", async () => {
    const setup = setupEngine({ 0: { hand: ["BT1-010", "BT1-085"] } });
    await setup.ready();
    setup.state.memory = 1;
    const window: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "main",
      selected: [],
      actions: mainActions(setup.engine, 0),
    };
    const index = window.actions.findIndex((action) => action.intent.type === "playCard" && action.projectedCost === 4);
    const features = actionFeatures(window, index);
    expect(features.playTamer).toBe(1);
    expect(features.handover).toBe(3);
  });
});
