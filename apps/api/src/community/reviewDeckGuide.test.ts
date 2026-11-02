import { describe, expect, it } from "vitest";
import { reviewDeckGuide } from "#api/community/reviewDeckGuide";

describe("guide moderation", () => {
  it.each([undefined, 42, [], {}, false])("refuses invalid input %j", (raw) => {
    expect(reviewDeckGuide({ raw })).toEqual({ allowed: false, error: "invalid_guide" });
  });
  it("normalizes before measuring and rejects rather than truncates", () => {
    expect(reviewDeckGuide({ raw: ` ${"a".repeat(5000)}  ` })).toEqual({ allowed: true, guide: "a".repeat(5000) });
    expect(reviewDeckGuide({ raw: "a".repeat(5001) })).toEqual({ allowed: false, error: "guide_too_long" });
    expect(reviewDeckGuide({ raw: "ﬀ".repeat(2501) })).toEqual({ allowed: false, error: "guide_too_long" });
  });
  it.each(["Muerte a la Royal Base", "cazzo", "死亡", "mu\u200berte"])("refuses restricted guide %s", (raw) => {
    expect(reviewDeckGuide({ raw })).toEqual({ allowed: false, error: "guide_not_allowed" });
  });
  it("allows card references in strategy guides", () => {
    const guide = "Use Death Claw to delete a Digimon.";
    expect(reviewDeckGuide({ raw: guide })).toEqual({ allowed: true, guide });
  });
  it("screens blocked words and clears empty guides", () => {
    expect(reviewDeckGuide({ raw: "Caralho" })).toEqual({ allowed: false, error: "guide_not_allowed" });
    expect(reviewDeckGuide({ raw: " \n " })).toEqual({ allowed: true, guide: null });
    expect(reviewDeckGuide({ raw: null })).toEqual({ allowed: true, guide: null });
  });
});
