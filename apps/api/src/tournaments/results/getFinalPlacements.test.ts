import { describe, expect, it } from "vitest";
import { getFinalPlacements } from "#api/tournaments/results/getFinalPlacements";

describe("getFinalPlacements", () => {
  it("places a single-elimination bracket by the round each player lost in", () => {
    const placements = getFinalPlacements({
      championParticipantId: "a",
      bracket: {
        finalRound: 3,
        matches: [
          { round: 1, winnerParticipantId: "a", participantIds: ["a", "e"] },
          { round: 1, winnerParticipantId: "b", participantIds: ["b", "f"] },
          { round: 1, winnerParticipantId: "c", participantIds: ["c", "g"] },
          { round: 1, winnerParticipantId: "d", participantIds: ["d", "h"] },
          { round: 2, winnerParticipantId: "a", participantIds: ["a", "b"] },
          { round: 2, winnerParticipantId: "c", participantIds: ["c", "d"] },
          { round: 3, winnerParticipantId: "a", participantIds: ["a", "c"] },
        ],
      },
      swissOrder: [],
      unranked: [],
    });

    expect(Object.fromEntries(placements)).toEqual({ a: 1, c: 2, b: 3, d: 3, e: 5, f: 5, g: 5, h: 5 });
  });

  it("ranks Swiss players outside the cut after every bracket player, in standings order", () => {
    const placements = getFinalPlacements({
      championParticipantId: "b",
      bracket: {
        finalRound: 6,
        matches: [
          { round: 5, winnerParticipantId: "a", participantIds: ["a", "d"] },
          { round: 5, winnerParticipantId: "b", participantIds: ["b", "c"] },
          { round: 6, winnerParticipantId: "b", participantIds: ["a", "b"] },
        ],
      },
      swissOrder: ["a", "b", "c", "d", "e", "f"],
      unranked: [],
    });

    expect(Object.fromEntries(placements)).toEqual({ b: 1, a: 2, d: 3, c: 3, e: 5, f: 6 });
  });

  it("uses the Swiss standings order when there is no bracket", () => {
    const placements = getFinalPlacements({
      championParticipantId: "b",
      bracket: null,
      swissOrder: ["b", "a", "c"],
      unranked: [],
    });

    expect([...placements]).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 3],
    ]);
  });

  it("places dropped and disqualified players after the ranked field by match points", () => {
    const placements = getFinalPlacements({
      championParticipantId: null,
      bracket: null,
      swissOrder: ["a", "b"],
      unranked: [
        { participantId: "late", matchPoints: 0 },
        { participantId: "early", matchPoints: 6 },
      ],
    });

    expect(Object.fromEntries(placements)).toEqual({ a: 1, b: 2, early: 3, late: 4 });
  });

  it("gives both players the round's placement after a double loss and skips byes", () => {
    const placements = getFinalPlacements({
      championParticipantId: "a",
      bracket: {
        finalRound: 2,
        matches: [
          { round: 1, winnerParticipantId: "a", participantIds: ["a"] },
          { round: 1, winnerParticipantId: null, participantIds: ["b", "c"] },
          { round: 2, winnerParticipantId: "a", participantIds: ["a", "d"] },
        ],
      },
      swissOrder: [],
      unranked: [],
    });

    expect(Object.fromEntries(placements)).toEqual({ a: 1, d: 2, b: 3, c: 3 });
  });
});
