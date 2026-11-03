import type { FieldEffectView } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { isHarmfulFieldEffect } from "@/game/isHarmfulFieldEffect";

function buildEffect(kind: FieldEffectView["kind"], value: number | string): FieldEffectView {
  return { kind, value, duration: 0, ownerSeat: 0 } as FieldEffectView;
}

describe("isHarmfulFieldEffect", () => {
  it("marks restrictions and DP losses as harmful", () => {
    expect(isHarmfulFieldEffect(buildEffect("restriction", "attack"))).toBe(true);
    expect(isHarmfulFieldEffect(buildEffect("dp", -2000))).toBe(true);
  });

  it("marks DP gains and keywords as helpful", () => {
    expect(isHarmfulFieldEffect(buildEffect("dp", 2000))).toBe(false);
    expect(isHarmfulFieldEffect(buildEffect("keyword", "Blocker"))).toBe(false);
  });
});
