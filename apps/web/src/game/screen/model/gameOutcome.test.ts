import { describe, expect, it } from "vitest";
import type { FinalRevealPlayer, Seat, ServerEvent } from "@aegis/shared";
import { revealedZones } from "./gameOutcome";

function hiddenZonesOf(seat: Seat, handCardId: string): FinalRevealPlayer {
  return {
    seat,
    hand: [{ cardId: handCardId, artId: handCardId }],
    deck: [],
    eggDeck: [],
    security: [],
  };
}

const surrenderDuringMulligan: ServerEvent[] = [
  { kind: "matchStarted", firstSeat: 1 },
  { kind: "gameOver", result: { outcome: "win", winnerSeat: 0 }, reason: "surrender" },
  { kind: "finalReveal", players: [hiddenZonesOf(0, "BT14-046"), hiddenZonesOf(1, "BT22-008")] },
];

describe("final reveal after a surrender during the mulligan", () => {
  it("keeps the opponent's hand hidden while the result waits for the opening deal", () => {
    expect(revealedZones({ events: surrenderDuringMulligan, viewerSeat: 0, resultShown: false })).toBeUndefined();
  });

  it("reveals the opponent's hand once the result is shown", () => {
    const revealed = revealedZones({ events: surrenderDuringMulligan, viewerSeat: 0, resultShown: true });

    expect(revealed?.opponent.hand).toEqual([{ cardId: "BT22-008", artId: "BT22-008" }]);
    expect(revealed?.viewer.hand).toEqual([{ cardId: "BT14-046", artId: "BT14-046" }]);
  });
});
