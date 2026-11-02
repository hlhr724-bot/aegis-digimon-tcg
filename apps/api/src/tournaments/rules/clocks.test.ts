import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import { describe, expect, it } from "vitest";
import { seriesDurationFor } from "./clocks.js";

const MINUTE = 60_000;
const OFFICIAL = buildTournamentRules({ bestOf: 3 });
const COMMUNITY_BEST_OF_ONE = buildTournamentRules({ bestOf: 1 });
const NO_CUT_CLOCK = {
  ...COMMUNITY_BEST_OF_ONE,
  match: { ...COMMUNITY_BEST_OF_ONE.match, topCutDurationMs: null, finalDurationMs: 30 * MINUTE },
};

describe("seriesDurationFor", () => {
  // Every timed answer is round clock + overtime, because what this feeds is the instant the
  // confrontation is DECIDED (manual §5.2: time, then the extra turns), not when the main clock
  // stops. Returning the round clock alone would skip the extra turns entirely.
  it("runs a Swiss round on the Swiss clock plus its overtime", () => {
    expect(seriesDurationFor(OFFICIAL, { phaseKind: "swiss", isFinal: false, structure: "swiss" })).toBe(
      45 * MINUTE + 5 * MINUTE,
    );
  });

  it("runs a Top Cut round on the cut clock plus overtime — the manual's 55 + 5", () => {
    expect(seriesDurationFor(OFFICIAL, { phaseKind: "top_cut", isFinal: false, structure: "swiss" })).toBe(
      55 * MINUTE + 5 * MINUTE,
    );
  });

  it("runs the final untimed where the ruleset says so", () => {
    expect(seriesDurationFor(OFFICIAL, { phaseKind: "top_cut", isFinal: true, structure: "swiss" })).toBeNull();
  });

  it("falls back to the final's clock for a preset with no cut clock, rather than to the Swiss one", () => {
    // A plain bracket event has no Swiss phase at all, so borrowing its clock would apply a
    // duration the format never runs.
    expect(
      seriesDurationFor(NO_CUT_CLOCK, {
        phaseKind: "single_elimination",
        isFinal: false,
        structure: "single_elimination",
      }),
    ).toBe(30 * MINUTE + 5 * MINUTE);
    expect(
      seriesDurationFor(NO_CUT_CLOCK, {
        phaseKind: "single_elimination",
        isFinal: true,
        structure: "single_elimination",
      }),
    ).toBe(30 * MINUTE + 5 * MINUTE);
  });

  it("uses the event's structure for a match that belongs to no phase", () => {
    // The legacy bracket predates phases and still writes matches with no `phase_id`.
    expect(seriesDurationFor(OFFICIAL, { phaseKind: null, isFinal: false, structure: "swiss" })).toBe(
      45 * MINUTE + 5 * MINUTE,
    );
    expect(
      seriesDurationFor(COMMUNITY_BEST_OF_ONE, { phaseKind: null, isFinal: false, structure: "single_elimination" }),
    ).toBe(25 * MINUTE + 5 * MINUTE);
  });

  it("runs untimed when the event has no frozen ruleset at all", () => {
    expect(seriesDurationFor(null, { phaseKind: "swiss", isFinal: false, structure: "swiss" })).toBeNull();
  });

  it("adds no overtime to an untimed final — there is no clock to extend", () => {
    expect(seriesDurationFor(OFFICIAL, { phaseKind: "top_cut", isFinal: true, structure: "swiss" })).toBeNull();
  });
});
