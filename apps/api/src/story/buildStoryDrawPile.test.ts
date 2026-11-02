import { describe, expect, it } from "vitest";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";

describe("story tournament deck adaptation", () => {
  it("replaces story cards one for one before allocating the opening zones", () => {
    expect(
      buildStoryDrawPile({
        counts: [
          ["BT24-008", 3],
          ["EX11-012", 4],
        ],
        substitutions: [
          ["BT24-008", "BT21-007", 1],
          ["EX11-012", "BT21-026", 1],
        ],
        placed: ["BT21-026"],
        opening: ["BT21-007"],
      }),
    ).toEqual(["BT21-007", "BT24-008", "BT24-008", "EX11-012", "EX11-012", "EX11-012"]);
  });

  it("rejects a story replacement that exceeds its tournament source count", () => {
    expect(() =>
      buildStoryDrawPile({ counts: [["BT24-008", 1]], substitutions: [["BT24-008", "BT21-007", 2]], placed: [] }),
    ).toThrow("Missing substitution in story deck: BT24-008");
  });
});
