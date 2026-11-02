import { describe, expect, it } from "vitest";
import { readReplayMomentIndex } from "@/replays/annotations/readReplayMomentIndex";

describe("replay moment deep links", () => {
  it("turns the one-based action in the link into a frame index", () => {
    expect(readReplayMomentIndex("?at=12")).toBe(11);
    expect(readReplayMomentIndex("?foo=1&at=1")).toBe(0);
  });

  it("ignores missing, zero and malformed actions", () => {
    for (const search of ["", "?at=", "?at=0", "?at=-3", "?at=1e3", "?at=abc", "?at=123456"]) {
      expect(readReplayMomentIndex(search)).toBeUndefined();
    }
  });
});
