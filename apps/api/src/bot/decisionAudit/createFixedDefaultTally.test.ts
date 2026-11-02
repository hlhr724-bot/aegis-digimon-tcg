import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { Phase, type Seat } from "@aegis/shared/schema/enums";
import { createFixedDefaultTally } from "#api/bot/decisionAudit/createFixedDefaultTally";
import { DecisionBasis } from "#api/bot/decisions/DecisionBasis";
import type { DecisionAnswer } from "#api/bot/decisions/DecisionAnswer";
import type { BotView } from "#api/bot/view";

function buildView(handCardIds: readonly string[]): BotView {
  return {
    seat: 0 as Seat,
    opponentSeat: 1 as Seat,
    phase: Phase.Main,
    turnSeat: 0 as Seat,
    gameOver: false,
    memory: 0,
    maxAffordable: 10,
    freeMemory: 0,
    hand: handCardIds.map((cardId, index) => ({
      instanceId: `hand-${index}`,
      cardId,
      definition: getCardDefinition(cardId),
      activatableEffects: [],
    })),
    board: [],
    opponentBoard: [],
    securityCount: 5,
    opponentSecurityCount: 5,
    deckCount: 30,
    eggDeckCount: 0,
    trashCount: 0,
    readyAttackers: [],
    ownFieldColors: new Set(),
  };
}

function pickFirstCandidate(request: DecisionRequest): DecisionAnswer {
  return {
    intent: {
      type: "respondDecision",
      decisionId: request.decisionId,
      response: { kind: "selectCards", instanceIds: (request.options?.candidateInstanceIds ?? []).slice(0, 1) },
    },
    basis: DecisionBasis.SCORED.value,
  };
}

function observeFirstPick(handCardIds: readonly string[]) {
  const tally = createFixedDefaultTally();
  const request: DecisionRequest = {
    decisionId: "discard",
    seat: 0,
    kind: "selectCards",
    promptText: "Discard",
    options: { candidateInstanceIds: handCardIds.map((_cardId, index) => `hand-${index}`), min: 1, max: 1 },
  };
  tally.observe({
    kind: "selectCards",
    view: buildView(handCardIds),
    request,
    answer: pickFirstCandidate(request),
    answerRequest: pickFirstCandidate,
  });
  return tally.report();
}

describe("fixed-default tally", () => {
  it("counts a choice that only candidate order decides as a fixed default", () => {
    const report = observeFirstPick(["BT1-010", "BT1-084"]);
    expect(report.fixedDefaults).toBe(1);
    expect(report.decisions).toEqual({ [`selectCards:${DecisionBasis.TIE_BY_ORDER.value}`]: 1 });
  });

  it("does not count a tie between two copies of the same card", () => {
    const report = observeFirstPick(["BT1-010", "BT1-010"]);
    expect(report.fixedDefaults).toBe(0);
    expect(report.nontrivialDecisions).toBe(1);
  });

  it("counts an answer the policy reports as unscored", () => {
    const tally = createFixedDefaultTally();
    tally.observe({
      kind: "evade",
      view: buildView([]),
      sourceCardId: "BT1-010",
      answer: {
        intent: { type: "respondEvade", permanentId: "unknown", accept: true },
        basis: DecisionBasis.UNSCORED_OPTIONAL.value,
      },
    });
    expect(tally.report().buckets).toEqual({
      [`evade:${DecisionBasis.UNSCORED_OPTIONAL.value}`]: {
        count: 1,
        cards: { "BT1-010": 1 },
        examples: [{ sourceCardId: "BT1-010" }],
      },
    });
  });
});
