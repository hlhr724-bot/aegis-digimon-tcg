import { describe, expect, it } from "vitest";
import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import { computeStandingsReport } from "#api/tournaments/standings/computeStandings";

describe("buildTournamentRules", () => {
  it("uses finite clocks for best-of-one and longer rounds for best-of-three", () => {
    expect(buildTournamentRules({ bestOf: 1 }).match).toEqual({
      winsRequired: 1,
      swissDurationMs: 1_500_000,
      topCutDurationMs: 1_500_000,
      finalDurationMs: 1_500_000,
      overtimeMs: 300_000,
    });
    expect(buildTournamentRules({ bestOf: 3 }).match).toEqual({
      winsRequired: 2,
      swissDurationMs: 2_700_000,
      topCutDurationMs: 3_300_000,
      finalDurationMs: null,
      overtimeMs: 300_000,
    });
  });

  it("keeps attendance, extra turns and standings independent of the match format", () => {
    const rules = buildTournamentRules({ bestOf: 3 });
    expect(rules.attendance).toEqual({ joinGraceMs: 300_000, gameLossAtMs: 300_000, matchLossAtMs: 600_000 });
    expect(rules.timeout.swissExtraTurns).toBe(3);
    expect(rules.timeout.eliminationExtraTurns).toBe(5);
    expect(rules.standings.winPoints).toBe(3);
    expect(rules.standings.drawPoints).toBe(1);
    for (const tiebreaker of rules.standings.tiebreakers) {
      expect(() =>
        computeStandingsReport({ ledger: [], standings: { ...rules.standings, tiebreakers: [tiebreaker] } }),
      ).not.toThrow();
    }
  });

  it("creates independent rule snapshots for each event", () => {
    const rules = buildTournamentRules({ bestOf: 3 });
    (rules.standings.tiebreakers as string[]).push("extra");
    (rules.timeout.stateTiebreakers as string[]).push("extra");
    rules.match.overtimeMs = 1;
    expect(buildTournamentRules({ bestOf: 3 }).standings.tiebreakers).toHaveLength(5);
    expect(buildTournamentRules({ bestOf: 3 }).timeout.stateTiebreakers).toHaveLength(4);
    expect(buildTournamentRules({ bestOf: 3 }).match.overtimeMs).toBe(300_000);
  });
});
