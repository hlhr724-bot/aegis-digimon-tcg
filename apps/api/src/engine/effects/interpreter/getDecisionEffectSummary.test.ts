import { describe, expect, it } from "vitest";
import type { Action } from "@aegis/shared/effects/ir/actions/action";
import { getDecisionEffectSummary } from "#api/engine/effects/interpreter/getDecisionEffectSummary";

describe("decision effect summaries", () => {
  it("counts a card returned from the controller's trash to hand apart from draws", () => {
    const actions: Action[] = [
      { kind: "Trash", target: { filter: { controller: "mine", zone: "hand" }, count: 1 }, optional: true },
      {
        kind: "Return",
        target: { filter: { zone: "trash", controller: "mine", kind: ["Digimon"] }, count: 1 },
        to: "hand",
      },
    ];
    expect(getDecisionEffectSummary({ actions })).toMatchObject({
      cardsDrawn: 0,
      cardsReturnedFromTrash: 1,
      uncertain: true,
    });
  });

  it("counts revealed cards added to hand or played as uncertain gains", () => {
    const actions: Action[] = [
      {
        kind: "RevealAdd",
        revealCount: 4,
        add: [
          { filter: { nameOrTrait: [{ tokens: ["Blue Flare"], match: "trait" }] }, count: 2, to: "hand" },
          { filter: { kind: ["Tamer"] }, count: 1, to: "play" },
        ],
        rest: "deckBottom",
      },
    ];
    expect(getDecisionEffectSummary({ actions })).toMatchObject({ cardsDrawn: 2, plays: 1, uncertain: true });
  });

  it("does not count a reveal of the opponent's deck", () => {
    const actions: Action[] = [
      {
        kind: "RevealAdd",
        controller: "opponent",
        revealCount: 3,
        add: [{ filter: {}, count: 1, to: "trash" }],
        rest: "deckBottom",
      },
    ];
    expect(getDecisionEffectSummary({ actions })).toMatchObject({ cardsDrawn: 0, plays: 0, uncertain: true });
  });
});
