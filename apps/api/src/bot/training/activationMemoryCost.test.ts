import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { mainActions } from "#api/bot/training/actions";
import { trainingObservation } from "#api/bot/training/observation";
import type { TrainingWindow } from "#api/bot/training/policy";
import { actionFeatures, chooseHeuristic, parseHeuristic } from "#api/bot/evolution/heuristic";
import "#api/cards/BT15/BT15-009";
import "#api/cards/P/P-035";

describe("activation memory information for bot decisions", () => {
  it("projects a paid activation and preserves state until the public intent pays it", async () => {
    const setup = setupEngine(
      { 0: { battleArea: [{ card: "BT15-009", as: "payer" }] } },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
      },
    );
    setup.state.memory = 1;
    await setup.ready();
    const before = JSON.stringify(setup.state);
    const actions = mainActions(setup.engine, 0);
    expect(JSON.stringify(setup.state)).toBe(before);
    const index = actions.findIndex((action) => action.intent.type === "activateEffect");
    expect(index).toBeGreaterThanOrEqual(0);
    const action = actions[index]!;
    expect(action.activationMemoryCost).toEqual({ minimum: 2, maximum: 2 });
    expect(action.projectedCost).toBe(2);
    const window: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "main",
      selected: [],
      actions,
    };
    expect(actionFeatures(window, index)).toMatchObject({ cost: 2, handover: 1, costUncertain: 0, freeActivation: 0 });
    expect(setup.engine.applyIntent(0, action.intent)).toEqual({ ok: true });
    await settle(() => setup.state.memory === -1);
    expect(setup.state.memory).toBe(-1);
    expect(setup.events.filter((event) => event.kind === "actionRejected")).toEqual([]);
  });

  it("projects a free Delay ability and resolves its actual memory gain", async () => {
    const setup = setupEngine({ 0: { battleArea: [{ card: "P-035", as: "boost" }] } }, { autoAcceptOptional: true });
    setup.state.memory = 1;
    await setup.ready();
    setup.perm("boost").enterFieldTurnCount = setup.state.turnCount - 1;
    const actions = mainActions(setup.engine, 0);
    const index = actions.findIndex((action) => action.intent.type === "activateEffect");
    expect(index).toBeGreaterThanOrEqual(0);
    expect(actions[index]!.activationMemoryCost).toEqual({ minimum: 0, maximum: 0 });
    const window: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "main",
      selected: [],
      actions,
    };
    expect(actionFeatures(window, index)).toMatchObject({ cost: 0, handover: 0, costUncertain: 0, freeActivation: 1 });
    expect(setup.engine.applyIntent(0, actions[index]!.intent)).toEqual({ ok: true });
    await settle(() => setup.state.players[0]!.trash.some((card) => card.cardId === "P-035"));
    expect(setup.state.memory).toBe(3);
  });

  it.each([
    { minimum: 2, maximum: 2 },
    { minimum: 0, maximum: 3 },
    { minimum: 0, maximum: null },
  ])("does not reward a paid or uncertain activation as free when memory is sufficient: %o", async (cost) => {
    const setup = setupEngine({ 0: { battleArea: [{ card: "BT15-009", as: "payer" }] } });
    setup.state.memory = 5;
    await setup.ready();
    const offered = mainActions(setup.engine, 0);
    const activate = offered.find((action) => action.intent.type === "activateEffect")!;
    const attack = offered.find((action) => action.intent.type === "attack")!;
    expect(activate).toBeDefined();
    expect(attack).toBeDefined();
    const window: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "main",
      selected: [],
      actions: [attack, { ...activate, projectedCost: undefined, activationMemoryCost: cost }],
    };
    const program = parseHeuristic({
      schemaVersion: 1,
      title: "Only proven free activations receive a bonus",
      rules: [
        { feature: "attackPlayer", weight: 1, advice: "Keep attacking pressure." },
        {
          feature: "activate",
          weight: 3,
          advice: "Favor proven free activations.",
          when: { kind: "main", minimum: { freeActivation: 1 } },
        },
      ],
    });
    expect(actionFeatures(window, 1).handover).toBe(0);
    expect(actionFeatures(window, 1).freeActivation).toBe(0);
    expect(chooseHeuristic(program, window)).toBe(0);
    const freeWindow = {
      ...window,
      actions: [attack, { ...activate, projectedCost: 0, activationMemoryCost: { minimum: 0, maximum: 0 } }],
    };
    expect(chooseHeuristic(program, freeWindow)).toBe(1);
  });
});
