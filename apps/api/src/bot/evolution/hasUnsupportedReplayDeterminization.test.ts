import { expect, it } from "vitest";
import { Zone } from "@aegis/shared/schema/enums";
import { hasUnsupportedReplayDeterminization } from "#api/bot/evolution/hasUnsupportedReplayDeterminization";

it("allows publicly revealed identities and rejects hidden ordering changes", () => {
  expect(hasUnsupportedReplayDeterminization({ kind: "cardRevealed", seat: 0, cardId: "BT1-010" })).toBe(false);
  expect(
    hasUnsupportedReplayDeterminization({
      kind: "securityRevealed",
      seat: 1,
      revealedCardId: "BT1-010",
      attackerPermanentId: "perm-1",
    }),
  ).toBe(false);
  expect(
    hasUnsupportedReplayDeterminization({
      kind: "cardsMoved",
      instanceIds: ["card-1"],
      from: Zone.Trash,
      to: Zone.Deck,
    }),
  ).toBe(true);
  expect(
    hasUnsupportedReplayDeterminization({
      kind: "cardsMoved",
      instanceIds: ["card-1"],
      from: Zone.Deck,
      to: Zone.Hand,
    }),
  ).toBe(false);
});
