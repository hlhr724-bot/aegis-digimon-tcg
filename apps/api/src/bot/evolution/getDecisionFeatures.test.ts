import { describe, expect, it } from "vitest";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import type { Seat } from "@aegis/shared/schema/enums";
import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import { setupScenario } from "#api/engine/testkit/scenario";
import { trainingObservation } from "#api/bot/training/observation";
import { createTrainingPolicy, type TrainingWindow } from "#api/bot/training/policy";
import { actionFeatures, chooseHeuristic, parseHeuristic } from "#api/bot/evolution/heuristic";
import { getDecisionEffectSummary } from "#api/engine/effects/interpreter/getDecisionEffectSummary";

interface PrepareSelectionParams {
  seat: Seat;
  duplicateRookie?: boolean;
  zone?: "hand" | "trash";
}

function prepareSelection({ seat, duplicateRookie = false, zone = "hand" }: PrepareSelectionParams) {
  const setup = setupScenario({
    turnCount: 0,
    isFirstPlayersFirstTurn: false,
    turnSeat: seat,
    memory: seat === 0 ? 3 : -3,
    board: {
      [seat]: {
        [zone]: [
          { card: "BT1-010", as: "rookie" },
          { card: "BT1-026", as: "mega" },
          ...(duplicateRookie ? [{ card: "BT1-010", as: "rookieCopy" }] : []),
        ],
      },
    },
  });
  const cards = [setup.inst("rookie"), setup.inst("mega")];
  const request: DecisionRequest = {
    decisionId: "contextual-selection",
    seat,
    kind: "selectCards",
    promptText: "Choose one visible card",
    options: { candidateInstanceIds: cards.map((card) => card.instanceId), min: 1, max: 1, effectControllerSeat: seat },
  };
  const program = parseHeuristic({
    schemaVersion: 1,
    title: "Contextual selections",
    rules: [
      { feature: "selectionGain", weight: 0.2, advice: "Value useful cards gained." },
      { feature: "selectionLoss", weight: -0.2, advice: "Preserve valuable cards when paying or discarding." },
      { feature: "selectionRookie", weight: 8, advice: "Preserve the only starting line." },
      { feature: "selectionDuplicate", weight: 4, advice: "Spend duplicates before unique hand resources." },
    ],
  });
  const windows: TrainingWindow[] = [];
  const policy = createTrainingPolicy(setup.engine, seat, (window) => {
    windows.push(window);
    return chooseHeuristic(program, window);
  });
  return { setup, request, policy, windows };
}

describe("context-aware effect decision features", () => {
  it.each([0, 1] as const)("changes preference between retrieval and discarding in seat %s", (seat) => {
    const retrieval = prepareSelection({ seat, zone: "trash" });
    retrieval.request.options!.selectionGoal = DecisionSelectionGoal.GAIN.value;
    expect(retrieval.policy.answerDecision(undefined, retrieval.request)).toMatchObject({
      response: { instanceIds: [retrieval.setup.inst("rookie").instanceId] },
    });
    expect(actionFeatures(retrieval.windows[0]!, 0).selectionGain).toBeGreaterThan(0);
    const { setup, request, policy, windows } = prepareSelection({ seat });
    request.options!.selectionGoal = DecisionSelectionGoal.DISCARD.value;
    request.options!.purpose = "cost";
    const before = JSON.stringify(setup.state);
    expect(policy.answerDecision(undefined, request)).toMatchObject({
      response: { instanceIds: [setup.inst("mega").instanceId] },
    });
    expect(actionFeatures(windows[0]!, 0).selectionRookie).toBe(-1);
    expect(JSON.stringify(setup.state)).toBe(before);
  });

  it("keeps ordinary unknown selections neutral even when prose suggests an outcome", () => {
    const { request, policy, windows } = prepareSelection({ seat: 0 });
    request.options!.effectText = "Play the strongest Digimon without paying its cost.";
    policy.answerDecision(undefined, request);
    for (let index = 0; index < windows[0]!.actions.length; index++) {
      expect(actionFeatures(windows[0]!, index)).toMatchObject({
        selectionGain: 0,
        selectionLoss: 0,
        selectionRookie: 0,
      });
    }
  });

  it("prefers the larger free play without treating it like a hand retrieval", () => {
    const { setup, request, policy } = prepareSelection({ seat: 0 });
    request.options!.selectionGoal = DecisionSelectionGoal.PLAY.value;
    expect(policy.answerDecision(undefined, request)).toMatchObject({
      response: { instanceIds: [setup.inst("mega").instanceId] },
    });
  });

  it("spends a duplicate rookie while preserving the unique higher-level resource", () => {
    const { setup, request, policy, windows } = prepareSelection({ seat: 0, duplicateRookie: true });
    request.options!.purpose = "cost";
    expect(policy.answerDecision(undefined, request)).toMatchObject({
      response: { instanceIds: [setup.inst("rookie").instanceId] },
    });
    expect(actionFeatures(windows[0]!, 0)).toMatchObject({ selectionDuplicate: 1, selectionRookie: 0 });
  });

  it("keeps blind opposing hand selections anonymous to every new feature", () => {
    const setup = setupScenario({
      turnSeat: 0,
      turnCount: 0,
      isFirstPlayersFirstTurn: false,
      memory: 3,
      board: { 1: { hand: ["BT1-010", "BT1-026"] } },
    });
    const request: DecisionRequest = {
      decisionId: "blind-selection",
      seat: 0,
      kind: "selectCards",
      promptText: "Choose without looking",
      options: {
        candidateInstanceIds: setup.state.players[1]!.hand.map((card) => card.instanceId),
        min: 1,
        max: 1,
        purpose: "cost",
        selectionGoal: DecisionSelectionGoal.DISCARD.value,
      },
    };
    const windows: TrainingWindow[] = [];
    const policy = createTrainingPolicy(setup.engine, 0, (window) => {
      windows.push(window);
      return 0;
    });
    policy.answerDecision(undefined, request);
    expect(windows[0]!.observation.players[1]!.hand).toEqual([]);
    for (let index = 0; index < windows[0]!.actions.length; index++) {
      expect(actionFeatures(windows[0]!, index)).toMatchObject({
        selectionGain: 0,
        selectionLoss: 0,
        selectionRookie: 0,
        selectionDuplicate: 0,
      });
    }
  });

  it("distinguishes evolving from removing and reverses opponent-controlled benefits", () => {
    const { setup } = prepareSelection({ seat: 0 });
    const memory = getDecisionEffectSummary({ actions: [{ kind: "GainMemory", amount: 2 }] });
    const evolution = getDecisionEffectSummary({
      actions: [{ kind: "Digivolve", target: { filter: {}, count: 1 }, payCost: false }],
    });
    const request: DecisionRequest = {
      decisionId: "effect-options",
      seat: 0,
      kind: "chooseOption",
      promptText: "Choose an effect",
      options: { choices: ["Gain memory", "Digivolve"], choiceSummaries: [memory, evolution], effectControllerSeat: 1 },
    };
    const window: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "chooseOption",
      request,
      selected: [],
      actions: request.options!.choices!.map((label, optionIndex) => ({
        label,
        intent: {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "chooseOption", optionIndex },
        },
      })),
    };
    expect(actionFeatures(window, 0)).toMatchObject({ decisionMemory: -2, decisionEvolution: 0 });
    expect(actionFeatures(window, 1)).toMatchObject({ decisionMemory: 0, decisionEvolution: -1 });
  });

  it("uses aligned costs for alternative routes into the same evolution", () => {
    const { setup } = prepareSelection({ seat: 0 });
    const request: DecisionRequest = {
      decisionId: "evolution-routes",
      seat: 0,
      kind: "chooseOption",
      promptText: "Choose a requirement",
      options: {
        choices: ["Expensive", "Cheap"],
        digivolveCostChoice: { fromCardId: "BT1-010", intoCardId: "BT1-026", costs: [5, 2], costDelta: -1 },
      },
    };
    const window: TrainingWindow = {
      observation: trainingObservation(setup.state, 0),
      kind: "chooseOption",
      request,
      selected: [],
      actions: [0, 1].map((optionIndex) => ({
        label: String(optionIndex),
        intent: {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "chooseOption", optionIndex },
        },
      })),
    };
    expect(actionFeatures(window, 0).decisionCost).toBe(4);
    expect(actionFeatures(window, 1).decisionCost).toBe(1);
  });
});
