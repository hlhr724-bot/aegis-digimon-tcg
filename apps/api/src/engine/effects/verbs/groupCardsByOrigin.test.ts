import { describe, expect, it } from "vitest";
import { Zone } from "@aegis/shared/schema/enums";
import { setupEngine } from "#api/engine/testkit/harness";
import { locateMoveOrigins } from "#api/engine/effects/verbs/locateMoveOrigins";
import { groupCardsByOrigin } from "#api/engine/effects/verbs/groupCardsByOrigin";

describe("contiguous movement groups", () => {
  it("preserves card order and separates zones, owners and hosts", () => {
    const setup = setupEngine({
      0: {
        hand: [
          { card: "ST1-03", as: "a" },
          { card: "ST1-03", as: "b" },
        ],
        battleArea: [{ card: "ST1-07", as: "host", under: [{ card: "ST1-03", as: "under" }] }],
      },
      1: { hand: [{ card: "ST1-03", as: "opponent" }] },
    });
    const cards = ["a", "b", "opponent", "under", "a"].map((alias) => setup.inst(alias));
    const origins = locateMoveOrigins({ state: setup.state, instanceIds: cards.map((card) => card.instanceId) });
    const groups = groupCardsByOrigin({ origins, cards });
    expect(groups.map((group) => group.cards.map((card) => card.instanceId))).toEqual([
      [cards[0]!.instanceId, cards[1]!.instanceId],
      [cards[2]!.instanceId],
      [cards[3]!.instanceId],
      [cards[4]!.instanceId],
    ]);
    expect(groups.map(({ from, fromSeat }) => ({ from, fromSeat }))).toEqual([
      { from: "hand", fromSeat: 0 },
      { from: "hand", fromSeat: 1 },
      { from: "digivolutionCards", fromSeat: 0 },
      { from: "hand", fromSeat: 0 },
    ]);
    expect(groupCardsByOrigin({ origins: new Map(), cards: [cards[0]!] })[0]?.from).toBe("various");
    expect(
      groupCardsByOrigin({
        origins,
        cards: [cards[3]!],
        collapseIntoHost: new Map([[setup.perm("host").permanentId, { from: Zone.BattleArea, fromSeat: 0 }]]),
      })[0],
    ).toMatchObject({ from: "battleArea", fromSeat: 0 });
  });
});
