import { describe, expect, it } from "vitest";
import { isSearchLeaf } from "#api/bot/search/isSearchLeaf";

describe("search leaf validity", () => {
  it.each(["rolloutCutoff", "security", "deckOut", "effect"])("scores a valid rollout that ended by %s", (reason) => {
    expect(isSearchLeaf({ valid: true, reason })).toBe(true);
  });

  it.each(["continuationLimit", "stalled", "unfinished", "surrender", "timeout"])(
    "discards a rollout that ended by %s",
    (reason) => {
      expect(isSearchLeaf({ valid: true, reason })).toBe(false);
    },
  );

  it("discards an invalid rollout even when it reached a leaf", () => {
    expect(isSearchLeaf({ valid: false, reason: "security" })).toBe(false);
  });
});
