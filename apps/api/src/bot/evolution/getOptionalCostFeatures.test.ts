import type { Action } from "@aegis/shared/effects/ir/actions/action";
import { getSingleHandCostBenefit } from "#api/engine/effects/interpreter/getSingleHandCostBenefit";
import { describe, expect, it } from "vitest";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import type { Seat } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { actionFeatures, chooseHeuristic, parseHeuristic } from "#api/bot/evolution/heuristic";
import { createTrainingPolicy, type TrainingWindow } from "#api/bot/training/policy";
import { getDecisionEffectSummary } from "#api/engine/effects/interpreter/getDecisionEffectSummary";

interface SetPaymentSummaryParams {
  request: DecisionRequest;
  actions: Action[];
}

function setPaymentSummary({ request, actions }: SetPaymentSummaryParams): void {
  const cost = { kind: "trash", target: { filter: { controller: "mine", zone: "hand" }, count: 1 } } as const;
  request.options!.effectSummary = getDecisionEffectSummary({ actions, cost });
  request.options!.singleHandCostBenefit = getSingleHandCostBenefit({ actions, cost });
}

interface PreparePaymentParams {
  seat?: Seat;
  hand?: string[];
  eggOnly?: boolean;
  establishedLine?: boolean;
}

function preparePayment({
  seat = 0,
  hand = ["BT1-090", "BT1-026", "BT1-010"],
  eggOnly = false,
  establishedLine = false,
}: PreparePaymentParams = {}) {
  const setup = setupScenario({
    turnSeat: seat,
    turnCount: 0,
    isFirstPlayersFirstTurn: false,
    memory: seat === 0 ? 3 : -3,
    board: {
      [seat]: {
        hand: hand.map((card, index) => ({ card, as: `payment${index}` })),
        deck: Array.from({ length: 6 }, () => "BT1-012"),
        ...(eggOnly ? { breeding: { card: "BT1-001", as: "egg" } } : {}),
        ...(establishedLine ? { battleArea: [{ card: "BT1-012", as: "line" }] } : {}),
      },
    },
  });
  const request: DecisionRequest = {
    decisionId: "optional-resource-payment",
    seat,
    kind: "selectCards",
    promptText: "Pay one card or decline",
    options: {
      candidateInstanceIds: hand.map((_card, index) => setup.inst(`payment${index}`).instanceId),
      min: 0,
      max: 1,
      purpose: "cost",
      effectControllerSeat: seat,
      effectSummary: getDecisionEffectSummary({
        actions: [{ kind: "Draw", amount: 2, controller: "mine", optional: true }],
      }),
    },
  };
  setPaymentSummary({ request, actions: [{ kind: "Draw", amount: 2, controller: "mine" }] });
  const program = parseHeuristic({
    schemaVersion: 1,
    title: "Optional resource payments",
    rules: [
      { feature: "finish", weight: 0.1, advice: "Stop when no payment is worthwhile." },
      ...(
        [
          ["paymentDraw", 1],
          ["paymentMemory", 1],
          ["paymentRecovery", 2],
          ["paymentCard", -1],
          ["paymentValue", -0.05],
          ["paymentStarter", -2],
          ["paymentDuplicate", 0.25],
        ] as const
      ).map(([feature, weight]) => ({
        feature,
        weight,
        advice: "Compare resources gained with the visible hand payment.",
        when: { kind: "selectCards" },
      })),
    ],
  });
  const windows: TrainingWindow[] = [];
  const policy = createTrainingPolicy(setup.engine, seat, (window) => {
    windows.push(window);
    return chooseHeuristic(program, window);
  });
  return { setup, request, policy, windows };
}

describe("paying optional hand costs for declared resources", () => {
  it.each([0, 1] as const)("spends the cheaper hand resource to draw twice in seat %s", (seat) => {
    const { setup, request, policy, windows } = preparePayment({ seat });
    const before = JSON.stringify(setup.state);
    expect(policy.answerDecision(undefined, request)).toMatchObject({
      response: { instanceIds: [setup.inst("payment0").instanceId] },
    });
    expect(actionFeatures(windows[0]!, 0)).toMatchObject({ paymentDraw: 2, paymentCard: 1 });
    expect(actionFeatures(windows[0]!, windows[0]!.actions.length - 1)).toMatchObject({
      paymentDraw: 0,
      paymentCard: 0,
    });
    expect(JSON.stringify(setup.state)).toBe(before);
  });

  it("declines drawing twice when the only payable card is a valuable top end", () => {
    const { request, policy } = preparePayment({ hand: ["BT1-026"] });
    expect(policy.answerDecision(undefined, request)).toMatchObject({ response: { instanceIds: [] } });
  });

  it("preserves the only rookie even with an egg in breeding", () => {
    const { request, policy, windows } = preparePayment({ hand: ["BT1-010"], eggOnly: true });
    expect(policy.answerDecision(undefined, request)).toMatchObject({ response: { instanceIds: [] } });
    expect(actionFeatures(windows[0]!, 0).paymentStarter).toBe(1);
  });

  it("allows spending that rookie when a starting line already exists", () => {
    const { setup, request, policy, windows } = preparePayment({ hand: ["BT1-010"], establishedLine: true });
    expect(policy.answerDecision(undefined, request)).toMatchObject({
      response: { instanceIds: [setup.inst("payment0").instanceId] },
    });
    expect(actionFeatures(windows[0]!, 0).paymentStarter).toBe(0);
  });

  it("spends a duplicate before a similarly valued unique hand card", () => {
    const { setup, request, policy } = preparePayment({ hand: ["BT1-090", "BT1-089", "BT1-089"] });
    const answer = policy.answerDecision(undefined, request);
    expect(answer).toMatchObject({
      response: {
        instanceIds: [
          expect.stringMatching(
            new RegExp(`${setup.inst("payment1").instanceId}|${setup.inst("payment2").instanceId}`),
          ),
        ],
      },
    });
  });

  it("does not reward a draw when the deck is empty", () => {
    const { setup, request, policy } = preparePayment();
    setup.state.players[0]!.deck.splice(0);
    expect(policy.answerDecision(undefined, request)).toMatchObject({ response: { instanceIds: [] } });
  });

  it.each([0, 1] as const)("caps gain at the deciding seat's memory limit in seat %s", (seat) => {
    const { setup, request, policy, windows } = preparePayment({ seat });
    setup.state.memory = seat === 0 ? 9 : -9;
    setPaymentSummary({ request, actions: [{ kind: "GainMemory", amount: 4 }] });
    expect(policy.answerDecision(undefined, request)).toMatchObject({ response: { instanceIds: [] } });
    expect(actionFeatures(windows[0]!, 0).paymentMemory).toBe(1);
  });

  it("does not assign a resource order when the deck cannot fund draw and recovery", () => {
    const { setup, request, policy, windows } = preparePayment();
    setup.state.players[0]!.deck.splice(1);
    setPaymentSummary({
      request,
      actions: [
        { kind: "Recover", amount: 2 },
        { kind: "Draw", amount: 2, controller: "mine" },
      ],
    });
    policy.answerDecision(undefined, request);
    expect(actionFeatures(windows[0]!, 0)).toMatchObject({ paymentDraw: 0, paymentRecovery: 0, paymentCard: 0 });
  });

  it.each([
    "mandatory",
    "multipleCards",
    "unknownSpending",
    "memorySpending",
    "opposingController",
    "unknownBenefit",
  ] as const)("leaves %s payment scoring unchanged", (scope) => {
    const { request, policy, windows } = preparePayment();
    const options = request.options!;
    if (scope === "mandatory") {
      options.min = 1;
    }
    if (scope === "multipleCards") {
      options.max = 2;
    }
    if (scope === "unknownSpending") {
      options.effectSummary = { ...options.effectSummary!, memoryCost: { minimum: 0, maximum: null } };
    }
    if (scope === "memorySpending") {
      options.effectSummary = { ...options.effectSummary!, memoryCost: { minimum: 1, maximum: 1 } };
    }
    if (scope === "opposingController") {
      options.effectControllerSeat = 1;
    }
    if (scope === "unknownBenefit") {
      options.effectSummary = undefined;
    }
    policy.answerDecision(undefined, request);
    expect(actionFeatures(windows[0]!, 0)).toMatchObject({
      paymentCard: 0,
      paymentDraw: 0,
      paymentMemory: 0,
      paymentRecovery: 0,
    });
  });
});
