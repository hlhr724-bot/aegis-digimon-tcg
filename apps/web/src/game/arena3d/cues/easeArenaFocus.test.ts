import { describe, expect, it } from "vitest";
import { easeArenaFocus } from "@/game/arena3d/cues/easeArenaFocus";

describe("easing the arena effect focus", () => {
  it("fades in toward the focused source", () => {
    const focus = easeArenaFocus({
      focus: { permanentId: undefined, level: 0 },
      targetId: "a",
      delta: 0.1,
      reducedMotion: false,
    });

    expect(focus.permanentId).toBe("a");
    expect(focus.level).toBeGreaterThan(0.4);
    expect(focus.level).toBeLessThan(1);
  });

  it("keeps the last source while fading out, then clears it", () => {
    const fading = easeArenaFocus({
      focus: { permanentId: "a", level: 1 },
      targetId: undefined,
      delta: 0.05,
      reducedMotion: false,
    });
    const cleared = easeArenaFocus({ focus: fading, targetId: undefined, delta: 5, reducedMotion: false });

    expect(fading.permanentId).toBe("a");
    expect(fading.level).toBeGreaterThan(0);
    expect(cleared).toEqual({ permanentId: undefined, level: 0 });
  });

  it("snaps under reduced motion", () => {
    expect(
      easeArenaFocus({ focus: { permanentId: undefined, level: 0 }, targetId: "a", delta: 0.01, reducedMotion: true }),
    ).toEqual({ permanentId: "a", level: 1 });
  });
});
