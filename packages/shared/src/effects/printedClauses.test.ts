import { describe, expect, it } from "vitest";
import { getCardDefinition } from "../cards/registry.js";
import type { CardEffect } from "./ir/card.js";
import { printedClauseForEffect, printedClauseForWatcher, splitPrintedClauses } from "./printedClauses.js";

const definitionOf = (cardId: string) => {
  const definition = getCardDefinition(cardId);
  if (definition === undefined) throw new Error(`missing ${cardId}`);
  return definition;
};

describe("splitPrintedClauses", () => {
  it.each([
    ['"', '"'],
    ["“", "”"],
  ])("preserves multiple quoted timings with %s%s and still splits the following clause", (open, close) => {
    const clause = `[On Play] Give 1 Digimon ${open}[Your Turn] Gain 1 memory. [All Turns] This Digimon gets +1000 DP.${close} and ${open}[On Deletion] Draw 1.${close} until the turn ends.`;
    const next = "[When Digivolving] Draw 2.";
    expect(splitPrintedClauses(`${clause}\n${next}`).map((entry) => entry.text)).toEqual([clause, next]);
  });

  it("splits at a timing printed with a typographic apostrophe (BT13-103's [End of Opponent’s Turn])", () => {
    const definition = definitionOf("BT13-103");
    const clauses = splitPrintedClauses(definition.effectText);
    expect(clauses.map((entry) => [...entry.labels])).toEqual([["Your Turn"], ["End of Opponent's Turn"]]);
    expect(clauses[0]!.text).toBe(
      "[Your Turn] When a card with [Belphemon] in its name would be played, by deleting 1 of your Digimon with [Gizmon] in its name, reduce the play cost by the play cost of the deleted Digimon.",
    );
    expect(printedClauseForEffect({ definition, effect: { trigger: "YourTurn", actions: [] } })).toBe(clauses[0]!.text);
  });

  it("keeps BT25-054's granted timing and duration inside its digivolution clause", () => {
    const definition = definitionOf("BT25-054");
    const clause = definition.effectText!.split("\n").find((line) => line.startsWith("[On Play]"))!;
    expect(splitPrintedClauses(definition.effectText).map((entry) => [...entry.labels])).toEqual([
      ["On Play", "When Digivolving"],
      ["All Turns"],
    ]);
    for (const trigger of ["OnPlay", "WhenDigivolving"] as const) {
      expect(printedClauseForEffect({ definition, effect: { trigger, actions: [] } })).toBe(clause);
    }
  });

  it("shows only Davis Motomiya's memory clause at the start of the turn", () => {
    const definition = definitionOf("BT3-093");
    expect(printedClauseForEffect({ definition, effect: { trigger: "StartOfYourTurn", actions: [] } })).toBe(
      "[Start of Your Turn] If you have 2 memory or less, set your memory to 3.",
    );
    expect(printedClauseForEffect({ definition, effect: { trigger: "OnPlay", actions: [] } })).toMatch(
      /^\[On Play\] Reveal the top 3 cards of your deck\./,
    );
  });

  it("keeps Homeros's two referenced timings inside its end-of-turn clause", () => {
    const definition = definitionOf("BT24-102");
    const clause = definition.effectText!.split("\n").find((line) => line.startsWith("[End of Your Turn]"))!;
    expect(printedClauseForEffect({ definition, effect: { trigger: "EndOfYourTurn", actions: [] } })).toBe(clause);
    expect(splitPrintedClauses(definition.effectText).map((entry) => [...entry.labels])).toEqual([
      ["Start of Your Main Phase"],
      ["All Turns"],
      ["End of Your Turn"],
    ]);
  });

  it.each(["or", "and", ",", "/"])("keeps a %s-linked timing reference before the next genuine clause", (connector) => {
    const clause = `[End of Your Turn] Activate 1 [On Play] ${connector} [When Digivolving] effect.`;
    const next = "[On Deletion] Draw 1.";
    expect(splitPrintedClauses(`${clause} ${next}`).map((entry) => entry.text)).toEqual([clause, next]);
  });

  it("groups adjacent timing brackets into one clause and skips the preamble", () => {
    const clauses = splitPrintedClauses(definitionOf("EX13-023").effectText);
    expect(clauses.map((clause) => [...clause.labels])).toEqual([
      ["On Play", "When Digivolving", "When Attacking"],
      ["On Play", "When Digivolving"],
      ["All Turns"],
    ]);
  });

  it("splits clauses printed on one line without separators", () => {
    const clauses = splitPrintedClauses(definitionOf("BT11-112").effectText);
    expect(clauses.map((clause) => clause.text.slice(0, 12))).toEqual(["[On Play] Un", "[All Turns] ", "[Your Turn]["]);
  });

  it("does not treat a timing named mid-sentence as a clause boundary", () => {
    const clauses = splitPrintedClauses(definitionOf("BT11-112").effectText);
    expect(clauses[1]!.text).toContain("[When Digivolving] effects");
  });
});

describe("printedClauseForEffect", () => {
  const orientation: CardEffect = {
    trigger: "WhenDigivolving",
    actions: [{ kind: "Modal", choose: 1, options: [], raw: "1 of your Digimon may change orientation" }],
  };
  const returnFewest: CardEffect = {
    trigger: "WhenDigivolving",
    actions: [
      {
        kind: "Return",
        target: { filter: {}, count: "all" },
        to: "deckBottom",
        raw: "return all of your opponent's Digimon with the fewest digivolution cards to the bottom of the deck",
      },
    ],
  };

  it("tells two clauses under the same bracket apart by their raw fragments", () => {
    const definition = definitionOf("EX13-023");
    expect(printedClauseForEffect({ definition, effect: orientation })).toMatch(
      /^\[On Play\] \[When Digivolving\] \[When Attacking\]/,
    );
    expect(printedClauseForEffect({ definition, effect: returnFewest })).toMatch(
      /^\[On Play\] \[When Digivolving\] You may return/,
    );
  });

  it("returns nothing when the raw fragments cannot pick one clause", () => {
    const definition = definitionOf("EX13-023");
    expect(printedClauseForEffect({ definition, effect: { trigger: "WhenDigivolving", actions: [] } })).toBeUndefined();
  });

  it("returns the only clause printed under the bracket", () => {
    const definition = definitionOf("BT11-112");
    expect(printedClauseForEffect({ definition, effect: { trigger: "OnPlay", actions: [] } })).toMatch(
      /^\[On Play\] Until/,
    );
  });

  it("reads a linked effect from the link box, not the main text", () => {
    const definition = definitionOf("BT24-057");
    expect(printedClauseForEffect({ definition, effect: { trigger: "OnDeletion", isLinked: true, actions: [] } })).toBe(
      definition.linkEffect,
    );
  });
});

describe("printedClauseForWatcher", () => {
  it("distinguishes BT11-032's unsuspend action from its when-unsuspended trigger", () => {
    const definition = definitionOf("BT11-032");
    const effect: CardEffect = { trigger: "YourTurn", actions: [] };
    expect(printedClauseForWatcher({ definition, effect, event: "whenPlayed", action: {} })).toBe(
      "[Your Turn] When you play a blue Tamer, unsuspend this Digimon.",
    );
    expect(printedClauseForWatcher({ definition, effect, event: "whenUnsuspended", action: {} })).toMatch(
      /^\[Your Turn\]\[Once Per Turn\] When this Digimon becomes unsuspended, return/,
    );
  });

  it("picks the continuous clause by the watcher's event phrase", () => {
    const definition = definitionOf("BT11-112");
    const effect: CardEffect = { trigger: "Static", actions: [] };
    expect(printedClauseForWatcher({ definition, effect, event: "whenUnsuspended", action: {} })).toMatch(
      /^\[Your Turn\]\[Once Per Turn\] When one of your blue Digimon becomes unsuspended/,
    );
    expect(printedClauseForWatcher({ definition, effect, event: "whenSuspended", action: {} })).toMatch(
      /^\[All Turns\] When one of your Digimon with \[Veedramon\]/,
    );
  });

  it("does not lend a linked watcher the main text's link clause (Discord 1557211687998984202)", () => {
    const definition = definitionOf("BT25-072");
    const effect: CardEffect = { trigger: "Static", isLinked: true, actions: [] };
    expect(printedClauseForWatcher({ definition, effect, event: "whenLinked", action: {} })).toBeUndefined();
  });

  it("ignores watchers installed by a triggered clause", () => {
    const definition = definitionOf("BT11-112");
    expect(
      printedClauseForWatcher({
        definition,
        effect: { trigger: "OnPlay", actions: [] },
        event: "whenSuspended",
        action: {},
      }),
    ).toBeUndefined();
  });
});

describe("printedClauseForEffect with requireHints", () => {
  it("does not hand a lone printed clause to an effect without matching raw fragments", () => {
    const definition = definitionOf("BT11-112");
    expect(
      printedClauseForEffect({ definition, effect: { trigger: "OnPlay", actions: [] }, requireHints: true }),
    ).toBeUndefined();
  });
});
