import { describe, expect, it } from "vitest";
import { targetHasRequirement } from "#api/engine/effects/interpreter/targeting/privateReveal";

describe("Private movement identity requirements", () => {
  it.each(["top", "bottom"] as const)("keeps a plain %s security card private", (position) => {
    expect(targetHasRequirement({ filter: { controller: "opponent", zone: "security", position }, count: 1 })).toBe(
      false,
    );
  });

  it.each(["top", "bottom"] as const)("still verifies a specified card kind at the %s of security", (position) => {
    expect(
      targetHasRequirement({
        filter: { controller: "opponent", zone: "security", position, kind: ["Digimon"] },
        count: 1,
      }),
    ).toBe(true);
  });
});
