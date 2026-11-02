import { describe, expect, it } from "vitest";
import { applyArenaCardCue } from "@/game/arena3d/cues/applyArenaCardCue";
import { ArenaCardChannel } from "@/game/arena3d/cues/ArenaCardChannel";
import type { ArenaCardCueState } from "@/game/arena3d/cues/ArenaCardCue";
import { ArenaCardTint } from "@/game/arena3d/cues/ArenaCardTint";
import { createArenaCardCueState } from "@/game/arena3d/cues/createArenaCardCueState";
import type { ArenaCardMotionSample } from "@/game/arena3d/effects/createArenaCardMotionRegistry";

function createSample(): ArenaCardMotionSample {
  return { offsetX: 0, offsetZ: 0, lift: 0, tilt: 0, roll: 0, spin: 0, scale: 1, flash: 0 };
}

function buildSourceState(startedAt: number): ArenaCardCueState {
  const state = createArenaCardCueState();
  return {
    cue: { ...state.cue, channel: ArenaCardChannel.SOURCE },
    timeline: { ...state.timeline, channelAt: startedAt, sourceAt: startedAt },
  };
}

const NO_FOCUS = { permanentId: undefined, level: 0 };

describe("applying a card cue to the GL card", () => {
  it("lifts an effect source and flashes it once at the activation", () => {
    const early = createSample();
    applyArenaCardCue({
      sample: early,
      permanentId: "a",
      state: buildSourceState(1),
      focus: NO_FOCUS,
      time: 1.2,
      reducedMotion: false,
    });
    const settled = createSample();
    applyArenaCardCue({
      sample: settled,
      permanentId: "a",
      state: buildSourceState(1),
      focus: NO_FOCUS,
      time: 3,
      reducedMotion: false,
    });

    expect(early.flash).toBeGreaterThan(0.2);
    expect(settled.flash).toBe(0);
    expect(settled.lift).toBeCloseTo(ArenaCardChannel.SOURCE.lift);
  });

  it("keeps the card still under reduced motion", () => {
    const sample = createSample();
    applyArenaCardCue({
      sample,
      permanentId: "a",
      state: buildSourceState(1),
      focus: NO_FOCUS,
      time: 1.2,
      reducedMotion: true,
    });

    expect(sample).toEqual(createSample());
  });

  it("dims every card except the focused source", () => {
    const focus = { permanentId: "source", level: 1 };
    const state = createArenaCardCueState();
    const other = applyArenaCardCue({
      sample: createSample(),
      permanentId: "other",
      state,
      focus,
      time: 1,
      reducedMotion: false,
    });
    const source = applyArenaCardCue({
      sample: createSample(),
      permanentId: "source",
      state,
      focus,
      time: 1,
      reducedMotion: false,
    });

    expect(other.shade).toBeLessThan(0.7);
    expect(source.shade).toBe(1);
  });

  it("pulses the tint colour and returns to none after the pulse", () => {
    const base = createArenaCardCueState();
    const state = { cue: { ...base.cue, tint: ArenaCardTint.DEBUFF }, timeline: { ...base.timeline, tintAt: 1 } };
    const peak = applyArenaCardCue({
      sample: createSample(),
      permanentId: "a",
      state,
      focus: NO_FOCUS,
      time: 1.35,
      reducedMotion: false,
    });
    const after = applyArenaCardCue({
      sample: createSample(),
      permanentId: "a",
      state,
      focus: NO_FOCUS,
      time: 2.5,
      reducedMotion: false,
    });

    expect(peak.tintColor).toBe(ArenaCardTint.DEBUFF.color);
    expect(peak.tintStrength).toBeGreaterThan(0.8);
    expect(after.tintStrength).toBe(0);
  });

  it("materializes a landing card, sweeps light across it, then rests", () => {
    const base = createArenaCardCueState();
    const state = { cue: { ...base.cue, landing: true }, timeline: { ...base.timeline, landingAt: 1 } };
    const look = (time: number, reducedMotion = false) =>
      applyArenaCardCue({ sample: createSample(), permanentId: "a", state, focus: NO_FOCUS, time, reducedMotion })
        .materialize;

    expect(look(1.2)).toBeLessThan(1);
    expect(look(1.55)).toBeGreaterThan(1);
    expect(look(1.55)).toBeLessThan(1.6);
    expect(look(3)).toBe(1.6);
    expect(look(1.2, true)).toBe(1.6);
  });
});
