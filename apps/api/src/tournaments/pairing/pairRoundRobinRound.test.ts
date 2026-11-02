import { describe, expect, it } from "vitest";
import { pairRoundRobinRound } from "#api/tournaments/pairing/pairRoundRobinRound";
import { roundRobinRoundCount } from "@aegis/shared/tournaments/roundRobinRoundCount";

function playAll(seating: string[]) {
  const activeIds = new Set(seating);
  return Array.from({ length: roundRobinRoundCount(seating.length) }, (_, index) =>
    pairRoundRobinRound({ seating, activeIds, roundNumber: index + 1 }),
  );
}

function pairKey(first: string, second: string): string {
  return [first, second].sort().join("-");
}

describe("pairRoundRobinRound", () => {
  it.each([2, 3, 4, 5, 6, 7, 8, 9])(
    "pairs every player with every other player exactly once with %i players",
    (size) => {
      const seating = Array.from({ length: size }, (_, index) => `p${index}`);
      const rounds = playAll(seating);
      const met = rounds.flatMap((round) =>
        round.pairings.map((pairing) => pairKey(pairing.participant0Id, pairing.participant1Id)),
      );
      expect(new Set(met).size).toBe(met.length);
      expect(met).toHaveLength((size * (size - 1)) / 2);
      for (const round of rounds) {
        const seated = round.pairings.flatMap((pairing) => [pairing.participant0Id, pairing.participant1Id]);
        expect(new Set(seated).size).toBe(seated.length);
      }
    },
  );

  it("gives each player exactly one bye when the field is odd", () => {
    const seating = ["a", "b", "c", "d", "e"];
    const byes = playAll(seating).flatMap((round) => round.byes.map((bye) => bye.participantId));
    expect([...byes].sort()).toEqual(seating);
  });

  it("gives a bye to the player whose scheduled opponent dropped", () => {
    const round = pairRoundRobinRound({
      seating: ["a", "b", "c", "d"],
      activeIds: new Set(["a", "b", "c"]),
      roundNumber: 1,
    });
    expect(round.pairings).toHaveLength(1);
    expect(round.byes).toHaveLength(1);
    expect(round.byes[0]!.participantId).not.toBe("d");
  });
});
