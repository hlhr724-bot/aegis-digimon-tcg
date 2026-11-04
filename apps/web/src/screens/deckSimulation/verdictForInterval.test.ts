import { describe, expect, it } from "vitest";
import { MatchupVerdict } from "@/screens/deckSimulation/MatchupVerdict";
import { verdictForInterval } from "@/screens/deckSimulation/verdictForInterval";

describe("verdictForInterval", () => {
  it("calls a matchup only when the whole range sits on one side of 50%", () => {
    expect(verdictForInterval([0.55, 0.8])).toBe(MatchupVerdict.FAVORED.value);
    expect(verdictForInterval([0.1, 0.45])).toBe(MatchupVerdict.BEHIND.value);
    expect(verdictForInterval([0.3, 0.7])).toBe(MatchupVerdict.CLOSE.value);
    expect(verdictForInterval([0.5, 0.9])).toBe(MatchupVerdict.CLOSE.value);
  });
});
