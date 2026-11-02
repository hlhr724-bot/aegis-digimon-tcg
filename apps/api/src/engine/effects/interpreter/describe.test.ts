import { getCardDefinition, type Action } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import {
  describeAction,
  describeCost,
  isInternalDescription,
  laterEntrantGrantClause,
  quotedGrantedClause,
  soleWatcherLine,
  soleLinkingClause,
  triggerLabel,
} from "./describe.js";

describe("describeAction", () => {
  it("prefers the printed sub-clause over any generated summary", () => {
    const action = {
      kind: "SecurityManipulation",
      op: "addTop",
      controller: "mine",
      amount: 1,
      raw: "By returning 3 cards in trashes to the bottom of the deck, ＜Recovery +1＞.",
    } as Action;
    expect(describeAction(action)).toBe("By returning 3 cards in trashes to the bottom of the deck, ＜Recovery +1＞.");
  });

  it("describes a cost-gated block by its cost and payload instead of its kind", () => {
    const action = {
      kind: "CostGatedBlock",
      cost: { kind: "trash", target: { count: 1, filter: { zone: "hand", controller: "mine" } } },
      actions: [
        { kind: "Draw", controller: "mine", amount: 1 },
        { kind: "GainMemory", amount: 1 },
      ],
    } as Action;
    expect(describeAction(action)).toBe("By paying: Trash 1 card(s) from hand → Draw 1, Gain 1 memory");
  });

  it("describes security manipulation by its operation", () => {
    expect(
      describeAction({ kind: "SecurityManipulation", op: "addTop", controller: "mine", amount: 2 } as Action),
    ).toBe("＜Recovery +2＞");
    expect(
      describeAction({ kind: "SecurityManipulation", op: "trashTop", controller: "opponent", amount: 1 } as Action),
    ).toBe("Trash 1 of opponent's top security card(s)");
  });

  it("prefixes an action's own activation cost", () => {
    const action = {
      kind: "SecurityManipulation",
      op: "addTop",
      controller: "mine",
      amount: 1,
      cost: { kind: "return", target: { count: 3, filter: { zone: "trash" } }, to: "deckBottom" },
    } as Action;
    expect(describeAction(action)).toBe("By paying: Return 3 card(s) → ＜Recovery +1＞");
  });

  it("leaves an unmapped kind as a bare identifier for the client to replace", () => {
    expect(describeAction({ kind: "Aura" } as Action)).toBe("Aura");
  });

  it("keeps Homeros's cost-bearing unmapped action eligible for the printed-clause fallback", () => {
    const action = {
      kind: "ActivateForeignEffect",
      zone: "battleArea",
      fromTriggers: ["OnPlay", "WhenDigivolving"],
      count: 1,
      cost: { kind: "suspend", target: { filter: { isSelfRef: true }, count: 1, isSelf: true } },
      optional: true,
    } as Action;
    expect(describeAction(action)).toBe("ActivateForeignEffect");
  });
});

describe("describeCost", () => {
  it("spells out memory and compound costs", () => {
    expect(describeCost({ kind: "payMemory", memory: 2 })).toBe("Pay 2 memory");
    expect(
      describeCost({
        kind: "compound",
        costs: [
          { kind: "payMemory", memory: 1 },
          { kind: "suspend", target: { count: 1, filter: {} } },
        ],
      }),
    ).toBe("Pay 1 memory and Suspend 1 card(s)");
  });
});

describe("player-facing watcher text", () => {
  it("recognizes engine bookkeeping and leaves card text alone", () => {
    const internals = [
      "whenPlayed",
      "onDigivolutionCardsDiscardedBatch",
      "GainTriggeredEffect(whenSuspended) on perm-4",
      "opponent-turn entrant granted effect",
      "GainKeyword later entrant from BT17-040",
    ];
    expect(internals.filter((text) => !isInternalDescription(text))).toEqual([]);
    const printed = [
      "[When Attacking] If your hand has 7 or fewer cards, ＜Draw 1＞",
      "[Main] Delete 1 target(s)",
      "[Granted] [On Deletion] Trash 1 card(s)",
    ];
    expect(printed.filter((text) => isInternalDescription(text))).toEqual([]);
  });

  it("reads the one clause a granting card quotes, in any quote style", () => {
    expect(
      quotedGrantedClause(
        "[Your Turn] When this Digimon digivolves, all of your opponent’s Digimon gain “[All Turns] When this Digimon is suspended, lose 1 memory.” until the end of your opponent’s turn.",
      ),
    ).toBe("[All Turns] When this Digimon is suspended, lose 1 memory.");
    expect(quotedGrantedClause('gain "[On Deletion] You may play this card without paying the cost."')).toBe(
      "[On Deletion] You may play this card without paying the cost.",
    );
    expect(quotedGrantedClause('gain "[On Play] A" and "[On Deletion] B"')).toBeUndefined();
    expect(quotedGrantedClause(undefined)).toBeUndefined();
  });

  it("finds a box's only watcher line and names triggers in words", () => {
    expect(
      soleWatcherLine(
        "＜Barrier＞\nWhen this card is trashed from the hand, ＜Draw 1＞\n[On Play] [When Attacking] By trashing 1 card, suspend 1.",
      ),
    ).toBe("When this card is trashed from the hand, ＜Draw 1＞");
    expect(soleWatcherLine("[Your Turn] When A, B.\n[All Turns] When C, D.")).toBeUndefined();
    expect(triggerLabel("OnDeletion")).toBe("On Deletion");
    expect(triggerLabel("whenSuspended")).toBe("When suspended");
  });

  it("keeps a later-entrant grant to the granting clause as printed", () => {
    const definition = getCardDefinition("EX1-068")!;
    const printed =
      '[Main] All of your opponent\'s Digimon gain "[When Attacking] Lose 2 memory" until their turn ends.';
    expect(laterEntrantGrantClause(printed, definition)).toBe(printed);
    expect(laterEntrantGrantClause("[Main] GrantStatic", definition)).toBe(
      `${definition.nameEn}: its effect also applies to a Digimon that entered later`,
    );
  });
});

it("selects only a unique When Linking clause without guessing between several", () => {
  const clause = "[When Linking] Suspend 1 Digimon.";
  expect(soleLinkingClause(clause + "\n[Your Turn] This Digimon gets +1000 DP.")).toBe(clause);
  expect(soleLinkingClause(clause + "\n[When Linking] Draw 1.")).toBeUndefined();
  expect(soleLinkingClause("[All Turns] When this Digimon gets linked, draw 1.")).toBeUndefined();
});
