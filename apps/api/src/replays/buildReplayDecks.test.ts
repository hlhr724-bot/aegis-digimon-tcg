import { describe, expect, it } from "vitest";
import { buildReplayDecks } from "#api/replays/buildReplayDecks";
import { buildSpectatorReplayFile } from "#api/replays/buildSpectatorReplayFile";
import type { UsedDeck } from "@aegis/shared/decks/UsedDeck";
import type { MatchReplay } from "@aegis/shared/replays";

const own: UsedDeck = { deckId: "private-id", deckName: "Own", mainDeck: ["BT1-010"], eggDeck: [] };
const other: UsedDeck = { deckId: "other-id", deckName: "Other", mainDeck: ["BT1-020"], eggDeck: [] };
const decks = new Map<0 | 1, UsedDeck>([
  [0, own],
  [1, other],
]);

describe("replay deck consent", () => {
  it("always includes the participant's own snapshot and omits a non-sharing opponent", () => {
    const result = buildReplayDecks({ decks, sharedSeats: [false, false], viewerSeat: 0 });
    expect(result).toEqual([{ deckName: "Own", mainDeck: ["BT1-010"], eggDeck: [] }, null]);
    expect(result[0]).not.toHaveProperty("deckId");
    result[0]!.mainDeck.push("BT1-011");
    expect(own.mainDeck).toEqual(["BT1-010"]);
    expect(buildReplayDecks({ decks, sharedSeats: [true, true], viewerSeat: 1 })[0]?.deckName).toBe("Own");
    expect(buildReplayDecks({ decks, sharedSeats: [false, true] })).toEqual([
      null,
      expect.objectContaining({ deckName: "Other" }),
    ]);
  });

  it("strips participant-only deck metadata from spectator files unless sharing is explicit, and anonymizes hidden decks", () => {
    const replay = {
      players: ["A", "B"],
      frames: [],
      decks: buildReplayDecks({ decks, sharedSeats: [true, true] }),
      deckIcons: ["BT1-010", "BT1-020"],
    } as unknown as MatchReplay;
    const closed = JSON.parse(buildSpectatorReplayFile({ replay, hiddenIdentities: [false, false] }).json);
    expect(closed.decks).toEqual([null, null]);
    expect(closed.deckIcons).toEqual([null, null]);
    const file = buildSpectatorReplayFile({ replay, hiddenIdentities: [true, false], sharedDeckSeats: [true, true] });
    const projected = JSON.parse(file.json);
    expect(projected.decks).toEqual([null, expect.objectContaining({ deckName: "Other" })]);
    expect(projected.deckIcons).toEqual([null, "BT1-020"]);
    expect(file.summary).not.toHaveProperty("decks");
    expect(replay.decks?.[0]?.deckName).toBe("Own");
  });
});
