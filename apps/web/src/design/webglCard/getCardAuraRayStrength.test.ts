import { describe, expect, it } from "vitest";
import { CardFinish } from "@/design/webglCard/CardFinish";
import { getCardAuraRayStrength } from "@/design/webglCard/getCardAuraRayStrength";

describe("getCardAuraRayStrength", () => {
  it("keeps rays off below the starlight foil", () => {
    expect(getCardAuraRayStrength(CardFinish.NONE)).toBe(0);
    expect(getCardAuraRayStrength(CardFinish.HOLO)).toBe(0);
  });

  it("strengthens the rays with each higher foil", () => {
    expect(getCardAuraRayStrength(CardFinish.STARLIGHT)).toBeCloseTo(0.25);
    expect(getCardAuraRayStrength(CardFinish.GOLD)).toBeCloseTo(0.33);
    expect(getCardAuraRayStrength(CardFinish.PRISMATIC)).toBeCloseTo(0.41);
  });
});
