import { describe, expect, it } from "vitest";
import { Zone } from "@aegis/shared/schema/enums";
import { hasUnsupportedReplayKnowledge } from "#api/bot/evolution/hasUnsupportedReplayKnowledge";

describe("replay hidden knowledge guard", () => {
  it("allows ordinary unknown draws and public breeding movements", () => {
    expect(hasUnsupportedReplayKnowledge({ kind: "cardsMoved", instanceIds: [], from: Zone.Deck, to: Zone.Hand })).toBe(
      false,
    );
    expect(
      hasUnsupportedReplayKnowledge({ kind: "cardsMoved", instanceIds: [], from: Zone.EggDeck, to: Zone.Breeding }),
    ).toBe(false);
  });

  it("excludes revealed cards and moves that can preserve hidden identities or ordering", () => {
    expect(hasUnsupportedReplayKnowledge({ kind: "cardRevealed", seat: 0, cardId: "BT1-010" })).toBe(true);
    expect(
      hasUnsupportedReplayKnowledge({ kind: "cardsMoved", instanceIds: [], from: Zone.Trash, to: Zone.Deck }),
    ).toBe(true);
    expect(
      hasUnsupportedReplayKnowledge({ kind: "cardsMoved", instanceIds: [], from: Zone.BattleArea, to: Zone.Hand }),
    ).toBe(true);
    expect(
      hasUnsupportedReplayKnowledge({ kind: "cardsMoved", instanceIds: [], from: Zone.Hand, to: Zone.Security }),
    ).toBe(true);
  });
});
