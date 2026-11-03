import type { FieldEffectView } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { ArenaFieldEffectTone } from "@/game/arena3d/slots/ArenaFieldEffectTone";
import { summarizeArenaFieldEffects } from "@/game/arena3d/slots/summarizeArenaFieldEffects";

function buildEffect(kind: FieldEffectView["kind"], value: number | string, sourceCardId?: string): FieldEffectView {
  return { kind, value, duration: 0, ownerSeat: 0, sourceCardId } as FieldEffectView;
}

describe("summarizeArenaFieldEffects", () => {
  it("reports a quiet field when no effect applies", () => {
    expect(summarizeArenaFieldEffects([])).toEqual({ tone: ArenaFieldEffectTone.NONE.value, marks: [], signature: "" });
  });

  it("treats DP gains and keywords as helpful", () => {
    const summary = summarizeArenaFieldEffects([buildEffect("dp", 2000), buildEffect("keyword", "Blocker")]);

    expect(summary.tone).toBe(ArenaFieldEffectTone.HELPFUL.value);
    expect(summary.marks.map((mark) => mark.harmful)).toEqual([false, false]);
  });

  it("treats restrictions and DP losses as harmful", () => {
    expect(summarizeArenaFieldEffects([buildEffect("restriction", "attack")]).tone).toBe(
      ArenaFieldEffectTone.HARMFUL.value,
    );
    expect(summarizeArenaFieldEffects([buildEffect("dp", 1000), buildEffect("dp", -3000)]).tone).toBe(
      ArenaFieldEffectTone.HARMFUL.value,
    );
  });

  it("changes the signature when an effect from another source arrives", () => {
    const before = summarizeArenaFieldEffects([buildEffect("dp", 1000, "BT1-001")]);
    const after = summarizeArenaFieldEffects([buildEffect("dp", 1000, "BT1-001"), buildEffect("dp", 1000, "BT1-002")]);

    expect(after.signature).not.toBe(before.signature);
    expect(summarizeArenaFieldEffects([buildEffect("dp", 1000, "BT1-001")]).signature).toBe(before.signature);
  });
});
