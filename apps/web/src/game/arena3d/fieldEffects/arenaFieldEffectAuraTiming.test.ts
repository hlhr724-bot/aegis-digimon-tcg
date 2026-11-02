import { describe, expect, it } from "vitest";
import { ARENA_FIELD_EFFECT_AURA_TIMING } from "@/game/arena3d/fieldEffects/arenaFieldEffectAuraTiming";
import { getArenaFieldEffectArrivalProgress } from "@/game/arena3d/fieldEffects/getArenaFieldEffectArrivalProgress";
import { getArenaFieldEffectArrivalStrength } from "@/game/arena3d/fieldEffects/getArenaFieldEffectArrivalStrength";
import { stepArenaFieldEffectWeight } from "@/game/arena3d/fieldEffects/stepArenaFieldEffectWeight";

const { arrivalRiseSeconds, arrivalTravelSeconds, arrivalSeconds } = ARENA_FIELD_EFFECT_AURA_TIMING;

describe("field effect aura arrival", () => {
  it("rises fast, peaks, then decays to nothing", () => {
    expect(getArenaFieldEffectArrivalStrength(-0.1)).toBe(0);
    expect(getArenaFieldEffectArrivalStrength(arrivalRiseSeconds / 2)).toBeCloseTo(0.5);
    expect(getArenaFieldEffectArrivalStrength(arrivalRiseSeconds)).toBeCloseTo(1);
    expect(getArenaFieldEffectArrivalStrength(0.6)).toBeLessThan(getArenaFieldEffectArrivalStrength(0.3));
    expect(getArenaFieldEffectArrivalStrength(arrivalSeconds)).toBe(0);
    expect(getArenaFieldEffectArrivalStrength(10)).toBe(0);
  });

  it("moves the ring with an ease-out and holds it at the end", () => {
    expect(getArenaFieldEffectArrivalProgress(0)).toBe(0);
    expect(getArenaFieldEffectArrivalProgress(arrivalTravelSeconds / 2)).toBeGreaterThan(0.5);
    expect(getArenaFieldEffectArrivalProgress(arrivalTravelSeconds)).toBe(1);
    expect(getArenaFieldEffectArrivalProgress(arrivalSeconds)).toBe(1);
  });
});

describe("field effect aura weight", () => {
  it("fades in faster than it fades out", () => {
    const risen = stepArenaFieldEffectWeight({ current: 0, active: true, delta: 0.2 });
    const fallen = 1 - stepArenaFieldEffectWeight({ current: 1, active: false, delta: 0.2 });

    expect(risen).toBeGreaterThan(fallen);
    expect(fallen).toBeGreaterThan(0);
  });

  it("settles on the target after a long step", () => {
    expect(stepArenaFieldEffectWeight({ current: 0, active: true, delta: 5 })).toBeCloseTo(1);
    expect(stepArenaFieldEffectWeight({ current: 1, active: false, delta: 10 })).toBeCloseTo(0);
  });
});
