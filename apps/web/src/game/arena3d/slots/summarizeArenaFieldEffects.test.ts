import type { FieldEffectView } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { summarizeArenaFieldEffects } from "@/game/arena3d/slots/summarizeArenaFieldEffects";

function buildEffect(kind: FieldEffectView["kind"], value: number | string): FieldEffectView {
  return { kind, value, duration: 0 } as FieldEffectView;
}

describe("summarizeArenaFieldEffects", () => {
  it("reports a quiet field when no effect applies", () => {
    expect(summarizeArenaFieldEffects([])).toEqual({ active: false, harmful: false });
  });

  it("treats DP gains and keywords as helpful", () => {
    expect(summarizeArenaFieldEffects([buildEffect("dp", 2000), buildEffect("keyword", "Blocker")])).toEqual({
      active: true,
      harmful: false,
    });
  });

  it("treats restrictions and DP losses as harmful", () => {
    expect(summarizeArenaFieldEffects([buildEffect("restriction", "attack")]).harmful).toBe(true);
    expect(summarizeArenaFieldEffects([buildEffect("dp", -3000)]).harmful).toBe(true);
  });
});
