import { describe, expect, it } from "vitest";
import { MatchFinaleTone } from "@/game/match/finale/MatchFinaleTone";
import { resolveMatchFinaleTone } from "@/game/match/finale/resolveMatchFinaleTone";

describe("resolveMatchFinaleTone", () => {
  it("celebrates the viewer's own win", () => {
    expect(resolveMatchFinaleTone({ winnerSeat: 1, viewerSeat: 1, spectating: false })).toBe(
      MatchFinaleTone.VICTORY.value,
    );
  });

  it("darkens the finale for the player who lost", () => {
    expect(resolveMatchFinaleTone({ winnerSeat: 0, viewerSeat: 1, spectating: false })).toBe(
      MatchFinaleTone.DEFEAT.value,
    );
  });

  it("keeps a neutral tone for spectators and replays seen from the side", () => {
    expect(resolveMatchFinaleTone({ winnerSeat: 0, viewerSeat: 0, spectating: true })).toBe(
      MatchFinaleTone.WITNESS.value,
    );
  });
});
