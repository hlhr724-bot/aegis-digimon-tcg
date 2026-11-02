import { describe, expect, it } from "vitest";
import { getSeatNames } from "@/game/log/getSeatNames";
import { translator } from "@/i18n/translator";

const t = translator("en");

describe("match history player names", () => {
  it("uses display names for participants and spectators", () => {
    const players = [{ displayName: "Alice" }, { displayName: "Bob" }];
    expect(getSeatNames({ players, viewerSeat: 0, t })).toEqual({ 0: "Alice", 1: "Bob" });
    expect(getSeatNames({ players, t })).toEqual({ 0: "Alice", 1: "Bob" });
  });

  it("falls back to the participant perspective", () => {
    expect(getSeatNames({ players: [], viewerSeat: 1, t })).toEqual({ 0: t("game.opponent"), 1: t("game.you") });
  });

  it("uses neutral numbered names for spectators", () => {
    expect(getSeatNames({ players: [], t })).toEqual({ 0: "Player 1", 1: "Player 2" });
  });

  it("uses replay names when snapshots have no display names", () => {
    expect(getSeatNames({ players: [{ displayName: " " }], replayPlayers: ["Alice", "Bob"], t })).toEqual({
      0: "Alice",
      1: "Bob",
    });
  });
});
