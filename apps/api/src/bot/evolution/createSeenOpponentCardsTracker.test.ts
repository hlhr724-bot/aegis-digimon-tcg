import { expect, it } from "vitest";
import { createSeenOpponentCardsTracker } from "#api/bot/evolution/createSeenOpponentCardsTracker";

it("remembers public reveals by the opponent and ignores the observer's private reveals", () => {
  const tracker = createSeenOpponentCardsTracker({ observer: 0 });
  tracker.observeEvent({ kind: "cardRevealed", seat: 1, cardId: "BT1-009", sourceCardId: "BT1-010" });
  tracker.observeEvent({ kind: "securityRevealed", seat: 1, revealedCardId: "BT1-019", attackerPermanentId: "perm-1" });
  tracker.observeEvent({ kind: "cardRevealed", seat: 0, cardId: "BT1-020" });
  expect(tracker.snapshot().main).toEqual(["BT1-009", "BT1-019"]);
  expect(tracker.snapshot().eggs).toEqual([]);
});

it("keeps revealed Digi-Egg evidence separate and avoids duplicate event counting", () => {
  const tracker = createSeenOpponentCardsTracker({ observer: 0 });
  const reveal = { kind: "cardRevealed", seat: 1, cardId: "BT1-001", sourceCardId: "BT1-010" } as const;
  tracker.observeEvent(reveal);
  tracker.observeEvent(reveal);
  expect(tracker.snapshot()).toEqual({ main: [], eggs: ["BT1-001"] });
});
