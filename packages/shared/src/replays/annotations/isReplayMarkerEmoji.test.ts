import { describe, expect, it } from "vitest";
import { isReplayMarkerEmoji } from "#shared/replays/annotations/isReplayMarkerEmoji";
import { ReplayMarkerEmoji } from "#shared/replays/annotations/ReplayMarkerEmoji";

describe("replay marker emoji", () => {
  it.each([...Object.values(ReplayMarkerEmoji).map((entry) => entry.value), "🦖", "⚔️", "👍🏽", "👨‍👩‍👧", "🇧🇷", "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "1️⃣"])(
    "accepts the single emoji %s",
    (emoji) => {
      expect(isReplayMarkerEmoji(emoji)).toBe(true);
    },
  );

  it.each(["", " ", "a", "1", "#", "ok", "⭐⭐", "⭐ ", " ⭐", "🇧", "<b>", "constructor", "🦖".repeat(20)])(
    "refuses %j",
    (value) => {
      expect(isReplayMarkerEmoji(value)).toBe(false);
    },
  );

  it("refuses values that are not strings", () => {
    for (const value of [undefined, null, 1, {}, ["⭐"]]) {
      expect(isReplayMarkerEmoji(value)).toBe(false);
    }
  });
});
