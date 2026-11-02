import { describe, expect, it } from "vitest";
import type { LedgerEntry, TournamentRules } from "@aegis/shared";
import {
  computeStandings,
  computeStandingsReport,
  MATCH_WIN_RATE_FLOOR,
  UnknownTiebreakerError,
} from "./computeStandings.js";

const officialScoring: TournamentRules["standings"] = {
  winPoints: 3,
  drawPoints: 1,
  lossPoints: 0,
  byePoints: 3,
  tiebreakers: ["points", "match_win_rate", "opponent_match_win_rate"],
};

function entry(
  participantId: string,
  opponentId: string | null,
  roundNumber: number,
  outcome: LedgerEntry["outcome"],
  opponentKind: LedgerEntry["opponentKind"] = opponentId === null ? null : "human",
): LedgerEntry {
  return { participantId, opponentId, opponentKind, roundNumber, outcome };
}

function match(
  winner: string,
  loser: string,
  roundNumber: number,
  loserOutcome: LedgerEntry["outcome"] = "loss",
): LedgerEntry[] {
  return [entry(winner, loser, roundNumber, "win"), entry(loser, winner, roundNumber, loserOutcome)];
}

function rowOf<T extends { participantId: string }>(rows: readonly T[], id: string): T {
  const row = rows.find((candidate) => candidate.participantId === id);
  if (!row) throw new Error(`No standings row for ${id}`);
  return row;
}

describe("computeStandings scoring", () => {
  it("scores wins, draws, losses and byes from the ruleset", () => {
    const ledger: LedgerEntry[] = [
      ...match("a", "b", 1),
      entry("c", null, 1, "bye"),
      entry("a", "c", 2, "draw"),
      entry("c", "a", 2, "draw"),
      ...match("b", "c", 3),
    ];

    const rows = computeStandings({ ledger, standings: officialScoring });

    expect(rowOf(rows, "a")).toMatchObject({ points: 4, wins: 1, draws: 1, losses: 0, byes: 0 });
    expect(rowOf(rows, "b")).toMatchObject({ points: 3, wins: 1, draws: 0, losses: 1, byes: 0 });
    expect(rowOf(rows, "c")).toMatchObject({ points: 4, wins: 0, draws: 1, losses: 1, byes: 1 });
  });

  it("scores double loss, no-show loss and concession as losses", () => {
    const ledger: LedgerEntry[] = [
      entry("a", "b", 1, "double_loss"),
      entry("b", "a", 1, "double_loss"),
      entry("c", "d", 1, "no_show_loss"),
      entry("d", "c", 1, "win"),
      entry("e", "f", 1, "concession"),
      entry("f", "e", 1, "win"),
    ];

    const rows = computeStandings({ ledger, standings: officialScoring });

    for (const id of ["a", "b", "c", "e"]) {
      expect(rowOf(rows, id)).toMatchObject({ points: 0, wins: 0, draws: 0, losses: 1 });
    }
    expect(rowOf(rows, "d")).toMatchObject({ points: 3, wins: 1 });
    expect(rowOf(rows, "f")).toMatchObject({ points: 3, wins: 1 });
  });

  it("keeps roster participants with no ledger entries", () => {
    const rows = computeStandings({
      ledger: [],
      standings: officialScoring,
      participants: [
        { id: "a", seed: 2 },
        { id: "b", seed: 1 },
      ],
    });

    expect(rows.map((row) => row.participantId)).toEqual(["b", "a"]);
    expect(rows.map((row) => row.rank)).toEqual([1, 2]);
    expect(rows.every((row) => row.points === 0)).toBe(true);
  });
});

describe("match win rate", () => {
  // Hand computed: 3 rated rounds, 2 wins + 1 loss = 6 points -> 6 / (3 x 3).
  it("is match points over rated rounds times win points", () => {
    const ledger: LedgerEntry[] = [...match("a", "b", 1), ...match("a", "c", 2), ...match("d", "a", 3)];

    const rows = computeStandings({ ledger, standings: officialScoring });

    expect(rowOf(rows, "a").matchWinRate).toBeCloseTo(6 / 9, 10);
  });

  // Hand computed: a bye is worth 3 points but is excluded from both the
  // numerator and the denominator, so 1 win + 1 loss + 1 bye is 3 / (2 x 3).
  it("excludes byes from numerator and denominator", () => {
    const ledger: LedgerEntry[] = [...match("a", "b", 1), entry("a", null, 2, "bye"), ...match("c", "a", 3)];

    const rows = computeStandings({ ledger, standings: officialScoring });

    expect(rowOf(rows, "a").points).toBe(6);
    expect(rowOf(rows, "a").matchWinRate).toBeCloseTo(3 / 6, 10);
  });

  // Regression, review finding 5: flooring a participant's own rate collapsed
  // every weak record onto 0.33, so two clearly different records tied on the
  // first tiebreaker. The floor belongs on the rates fed to opponents only.
  it("reports the raw rate, unfloored, and keeps weak records apart", () => {
    // "x": 1 draw in 4 rated rounds = 1 / 12. "y": 1 draw in 3 = 1 / 9.
    // Both are below the floor and must stay distinct.
    const ledger: LedgerEntry[] = [
      entry("x", "d1", 1, "draw"),
      entry("d1", "x", 1, "draw"),
      ...match("l1", "x", 2),
      ...match("l2", "x", 3),
      ...match("l3", "x", 4),
      entry("y", "d2", 1, "draw"),
      entry("d2", "y", 1, "draw"),
      ...match("l4", "y", 2),
      ...match("l5", "y", 3),
    ];

    const report = computeStandingsReport({ ledger, standings: officialScoring });

    expect(rowOf(report.rows, "x").matchWinRate).toBeCloseTo(1 / 12, 10);
    expect(rowOf(report.rows, "y").matchWinRate).toBeCloseTo(1 / 9, 10);
    // The floored value still exists; it is what the opponent averages consume.
    expect(rowOf(report.rows, "x").flooredMatchWinRate).toBe(MATCH_WIN_RATE_FLOOR);
    expect(rowOf(report.rows, "y").flooredMatchWinRate).toBe(MATCH_WIN_RATE_FLOOR);
    // And the tiebreaker separates them instead of declaring a tie.
    expect(rowOf(report.rows, "y").rank).toBeLessThan(rowOf(report.rows, "x").rank);
  });

  it("reports a winless record as zero", () => {
    const ledger: LedgerEntry[] = [...match("a", "b", 1), ...match("a", "b", 2), ...match("a", "b", 3)];

    const report = computeStandingsReport({ ledger, standings: officialScoring });

    expect(rowOf(report.rows, "b").matchWinRate).toBe(0);
    expect(rowOf(report.rows, "b").flooredMatchWinRate).toBe(MATCH_WIN_RATE_FLOOR);
  });

  it("gives a participant with only byes no rate and a floored opponent rate", () => {
    const report = computeStandingsReport({
      ledger: [entry("a", null, 1, "bye")],
      standings: officialScoring,
    });

    expect(rowOf(report.rows, "a").matchWinRate).toBe(0);
    expect(rowOf(report.rows, "a").opponentMatchWinRate).toBe(MATCH_WIN_RATE_FLOOR);
  });

  it("takes the floor from the ruleset when it carries one", () => {
    const ledger: LedgerEntry[] = [...match("a", "b", 1), ...match("a", "b", 2)];

    const report = computeStandingsReport({
      ledger,
      standings: { ...officialScoring, winRateFloor: 0.5 },
    });

    // "b" is winless, so every opponent average that reads its rate sees 0.5.
    expect(rowOf(report.rows, "b").flooredMatchWinRate).toBe(0.5);
    expect(rowOf(report.rows, "a").opponentMatchWinRate).toBe(0.5);
  });
});

describe("opponent match win rate", () => {
  // Hand computed golden case.
  //   Round 1: a beats b, c beats d.
  //   Round 2: a beats c, b beats d.
  //   Round 3: a beats d, c beats b.
  // Rates: a = 9/9 = 1; b = 3/9 = 0.33 (floored, exactly at the floor);
  //        c = 6/9; d = 0/9 -> floored to 0.33.
  // a met b, c, d -> (0.33 + 6/9 + 0.33) / 3.
  it("averages the floored rates of every opponent met", () => {
    const ledger: LedgerEntry[] = [
      ...match("a", "b", 1),
      ...match("c", "d", 1),
      ...match("a", "c", 2),
      ...match("b", "d", 2),
      ...match("a", "d", 3),
      ...match("c", "b", 3),
    ];

    const report = computeStandingsReport({ ledger, standings: officialScoring });

    expect(rowOf(report.rows, "b").matchWinRate).toBeCloseTo(1 / 3, 10);
    expect(rowOf(report.rows, "d").matchWinRate).toBe(0);
    expect(rowOf(report.rows, "d").flooredMatchWinRate).toBe(MATCH_WIN_RATE_FLOOR);
    expect(rowOf(report.rows, "a").opponentMatchWinRate).toBeCloseTo((1 / 3 + 6 / 9 + MATCH_WIN_RATE_FLOOR) / 3, 10);
  });

  // The bye round contributes no opponent at all, so the average is over the
  // two real opponents only.
  it("excludes byes from the opponent average", () => {
    const ledger: LedgerEntry[] = [
      entry("a", null, 1, "bye"),
      ...match("a", "b", 2),
      ...match("a", "c", 3),
      ...match("b", "c", 4),
    ];

    const report = computeStandingsReport({ ledger, standings: officialScoring });

    const rateB = rowOf(report.rows, "b").flooredMatchWinRate;
    const rateC = rowOf(report.rows, "c").flooredMatchWinRate;
    expect(rowOf(report.rows, "a").opponentMatchWinRate).toBeCloseTo((rateB + rateC) / 2, 10);
  });

  // Convention: an opponent met twice weighs twice, matching the published
  // formula's "average over matches played" rather than "over distinct rivals".
  it("counts an opponent met twice twice", () => {
    const ledger: LedgerEntry[] = [
      ...match("a", "b", 1),
      ...match("a", "b", 2),
      ...match("a", "c", 3),
      ...match("c", "d", 1),
      ...match("c", "d", 2),
    ];

    const report = computeStandingsReport({ ledger, standings: officialScoring });

    const rateB = rowOf(report.rows, "b").flooredMatchWinRate;
    const rateC = rowOf(report.rows, "c").flooredMatchWinRate;
    expect(rowOf(report.rows, "a").opponentMatchWinRate).toBeCloseTo((rateB + rateB + rateC) / 3, 10);
  });
});

describe("opponents missing from the data", () => {
  it("counts matches against unknown opponents instead of averaging them in", () => {
    const ledger: LedgerEntry[] = [
      // "ghost" never gets a row of its own: no ledger entry, not on the roster.
      entry("a", "ghost", 1, "win"),
      ...match("a", "b", 2),
    ];

    const report = computeStandingsReport({
      ledger,
      standings: officialScoring,
      participants: [
        { id: "a", seed: 1 },
        { id: "b", seed: 2 },
      ],
    });

    expect(rowOf(report.rows, "a").unratedOpponentMatches).toBe(1);
    // The average is over "b" alone, not "b" plus an invented floor.
    expect(rowOf(report.rows, "a").opponentMatchWinRate).toBe(rowOf(report.rows, "b").flooredMatchWinRate);
    expect(rowOf(report.rows, "b").unratedOpponentMatches).toBe(0);
  });
});

describe("bot opponents", () => {
  const ledger: LedgerEntry[] = [
    entry("a", "bot1", 1, "win", "bot"),
    entry("bot1", "a", 1, "loss", "human"),
    ...match("a", "b", 2),
    ...match("b", "c", 1),
  ];

  it("keeps bot matches out of the opponent rates by default, and reports the count", () => {
    const report = computeStandingsReport({ ledger, standings: officialScoring });

    expect(report.botOpponentsIncluded).toBe(false);
    expect(rowOf(report.rows, "a").botOpponentMatches).toBe(1);

    // The average is over the human opponent alone; the bot's manufactured rate
    // never reaches a tiebreaker.
    const rateB = rowOf(report.rows, "b").flooredMatchWinRate;
    expect(rowOf(report.rows, "a").opponentMatchWinRate).toBeCloseTo(rateB, 10);
    // The bot match still scores points; only the opponent average ignores it.
    expect(rowOf(report.rows, "a").points).toBe(6);
  });

  it("counts bot matches in the opponent rates when a ruleset opts in", () => {
    const report = computeStandingsReport({
      ledger,
      standings: officialScoring,
      options: { includeBotOpponentsInOpponentRates: true },
    });

    expect(report.botOpponentsIncluded).toBe(true);
    const rateBot = rowOf(report.rows, "bot1").flooredMatchWinRate;
    const rateB = rowOf(report.rows, "b").flooredMatchWinRate;
    expect(rowOf(report.rows, "a").opponentMatchWinRate).toBeCloseTo((rateBot + rateB) / 2, 10);
  });
});

describe("tiebreaker chain", () => {
  it("orders by points first, whatever the chain says", () => {
    const ledger: LedgerEntry[] = [...match("a", "b", 1), ...match("a", "c", 2)];

    const rows = computeStandings({
      ledger,
      standings: { ...officialScoring, tiebreakers: [] },
      participants: [
        { id: "a", seed: 3 },
        { id: "b", seed: 1 },
        { id: "c", seed: 2 },
      ],
    });

    expect(rows[0]?.participantId).toBe("a");
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it("applies own win rate before the opponent rate", () => {
    // Both finish on 6 points: "high" from one win plus a bye (one rated round,
    // rate 1.0), "low" from two wins and a loss (three rated rounds, rate 6/9).
    const ledger: LedgerEntry[] = [
      ...match("high", "filler1", 1),
      entry("high", null, 2, "bye"),
      ...match("low", "filler2", 1),
      ...match("low", "filler3", 2),
      ...match("filler4", "low", 3),
    ];

    const rows = computeStandings({ ledger, standings: officialScoring });
    const ranked = rows.filter((row) => row.participantId === "high" || row.participantId === "low");

    expect(rowOf(rows, "high").points).toBe(6);
    expect(rowOf(rows, "low").points).toBe(6);
    expect(rowOf(rows, "high").matchWinRate).toBeCloseTo(1, 10);
    expect(rowOf(rows, "low").matchWinRate).toBeCloseTo(6 / 9, 10);
    expect(ranked[0]?.participantId).toBe("high");
  });

  it("falls back to seed then id for a total order", () => {
    const rows = computeStandings({
      ledger: [],
      standings: officialScoring,
      participants: [
        { id: "z", seed: null },
        { id: "m", seed: null },
        { id: "s", seed: 4 },
      ],
    });

    expect(rows.map((row) => row.participantId)).toEqual(["s", "m", "z"]);
  });

  it("accepts officially defined criteria it cannot settle and reports them", () => {
    const report = computeStandingsReport({
      ledger: [...match("a", "b", 1)],
      standings: {
        ...officialScoring,
        tiebreakers: [
          "points",
          "match_win_rate",
          "opponent_match_win_rate",
          "extra_match",
          "head_to_head",
          "judge_random_draw",
        ],
      },
    });

    expect(report.unresolvedTiebreakers).toEqual(["extra_match"]);
  });

  it("rejects an unknown criterion instead of ignoring it", () => {
    expect(() =>
      computeStandings({
        ledger: [],
        standings: { ...officialScoring, tiebreakers: ["vibes"] },
      }),
    ).toThrow(UnknownTiebreakerError);
  });

  it("supports the World Championship chain including OOMW%", () => {
    const ledger: LedgerEntry[] = [
      ...match("a", "b", 1),
      ...match("c", "d", 1),
      ...match("a", "c", 2),
      ...match("b", "d", 2),
    ];

    const report = computeStandingsReport({
      ledger,
      standings: {
        ...officialScoring,
        drawPoints: 0,
        tiebreakers: ["points", "opponent_match_win_rate", "opponent_opponent_match_win_rate", "judge_random_draw"],
      },
    });

    const rowB = rowOf(report.rows, "b");
    const rateA = rowOf(report.rows, "a").opponentMatchWinRate;
    const rateD = rowOf(report.rows, "d").opponentMatchWinRate;
    expect(rowB.opponentOpponentMatchWinRate).toBeCloseTo((rateA + rateD) / 2, 10);
  });
});

describe("head-to-head tiebreaker", () => {
  const headToHeadScoring = { ...officialScoring, tiebreakers: ["points", "head_to_head"] };

  function orderOf(ledger: LedgerEntry[], seeds: Record<string, number>): string[] {
    return computeStandings({
      ledger,
      standings: headToHeadScoring,
      participants: Object.entries(seeds).map(([id, seed]) => ({ id, seed })),
    }).map((row) => row.participantId);
  }

  it("ranks the winner of the match between two tied players first", () => {
    const ledger: LedgerEntry[] = [
      ...match("b", "a", 1),
      ...match("a", "c", 2),
      entry("b", "z", 2, "double_loss"),
      entry("z", "b", 2, "double_loss"),
    ];

    expect(orderOf(ledger, { a: 1, b: 2, c: 3, z: 4 })).toEqual(["b", "a", "c", "z"]);
  });

  it("ranks a player who beat every other tied player first, then settles the rest the same way", () => {
    const ledger: LedgerEntry[] = [
      ...match("a", "b", 1),
      ...match("a", "c", 2),
      ...match("r", "a", 3),
      ...match("b", "p", 2),
      ...match("b", "c", 3),
      ...match("c", "q", 1),
      ...match("c", "t", 4),
    ];

    expect(orderOf(ledger, { c: 1, b: 2, a: 3, r: 4, p: 5, q: 6, t: 7 }).slice(0, 3)).toEqual(["a", "b", "c"]);
  });

  it("leaves a three-way cycle to the next criterion", () => {
    const ledger: LedgerEntry[] = [...match("a", "b", 1), ...match("b", "c", 2), ...match("c", "a", 3)];

    expect(orderOf(ledger, { c: 1, a: 2, b: 3 })).toEqual(["c", "a", "b"]);
  });

  it("leaves tied players who never met to the next criterion", () => {
    const ledger: LedgerEntry[] = [...match("a", "x", 1), ...match("b", "y", 1)];

    expect(orderOf(ledger, { b: 1, a: 2, x: 3, y: 4 })).toEqual(["b", "a", "x", "y"]);
  });

  it("does not let a rematch split decide the order", () => {
    const ledger: LedgerEntry[] = [...match("a", "b", 1), ...match("b", "a", 2)];

    expect(orderOf(ledger, { b: 1, a: 2 })).toEqual(["b", "a"]);
  });
});

describe("judge random draw tiebreaker", () => {
  const drawScoring = { ...officialScoring, tiebreakers: ["points", "judge_random_draw"] };
  const field = ["a", "b", "c", "d", "e", "f"];

  function drawOrder(
    drawSeed: string,
    seeds: readonly (number | null)[] = field.map((_, index) => index + 1),
  ): string[] {
    return computeStandings({
      ledger: [],
      standings: drawScoring,
      participants: field.map((id, index) => ({ id, seed: seeds[index] ?? null })),
      drawSeed,
    }).map((row) => row.participantId);
  }

  it("returns the same order for the same draw seed", () => {
    expect(drawOrder("tournament-1")).toEqual(drawOrder("tournament-1"));
  });

  it("ignores registration seeds", () => {
    expect(drawOrder("tournament-1", [6, 5, 4, 3, 2, 1])).toEqual(drawOrder("tournament-1"));
  });

  it("produces different orders for different draw seeds", () => {
    const orders = new Set(["t1", "t2", "t3", "t4", "t5"].map((seed) => drawOrder(seed).join(",")));

    expect(orders.size).toBeGreaterThan(1);
  });

  it("applies after head-to-head", () => {
    const ledger: LedgerEntry[] = [
      ...match("b", "a", 1),
      ...match("a", "c", 2),
      entry("b", "z", 2, "double_loss"),
      entry("z", "b", 2, "double_loss"),
    ];

    for (const drawSeed of ["t1", "t2", "t3", "t4", "t5"]) {
      const rows = computeStandings({
        ledger,
        standings: { ...officialScoring, tiebreakers: ["points", "head_to_head", "judge_random_draw"] },
        drawSeed,
      });
      const tied = rows.filter((row) => row.points === 3).map((row) => row.participantId);
      expect(tied.indexOf("b")).toBeLessThan(tied.indexOf("a"));
    }
  });
});

describe("purity", () => {
  it("returns identical output for identical input", () => {
    const ledger: LedgerEntry[] = [
      ...match("a", "b", 1),
      ...match("c", "d", 1),
      entry("e", null, 1, "bye"),
      ...match("a", "c", 2),
    ];
    const input = { ledger, standings: officialScoring };

    expect(computeStandings(input)).toEqual(computeStandings(input));
  });

  it("does not depend on ledger ordering", () => {
    const ledger: LedgerEntry[] = [
      ...match("a", "b", 1),
      ...match("c", "d", 1),
      ...match("a", "c", 2),
      ...match("b", "d", 2),
    ];

    const forward = computeStandings({ ledger, standings: officialScoring });
    const reversed = computeStandings({
      ledger: [...ledger].reverse(),
      standings: officialScoring,
    });

    expect(reversed).toEqual(forward);
  });

  it("does not mutate the input ledger", () => {
    const ledger: LedgerEntry[] = [...match("a", "b", 1)];
    const snapshot = JSON.parse(JSON.stringify(ledger));

    computeStandings({ ledger, standings: officialScoring });

    expect(ledger).toEqual(snapshot);
  });
});
