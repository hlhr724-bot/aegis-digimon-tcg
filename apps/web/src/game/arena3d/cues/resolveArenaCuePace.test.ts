import { describe, expect, it } from "vitest";
import { ArenaCardChannel } from "@/game/arena3d/cues/ArenaCardChannel";
import type { ArenaCardCueState, ArenaFocus } from "@/game/arena3d/cues/ArenaCardCue";
import { ArenaCuePace } from "@/game/arena3d/cues/ArenaCuePace";
import { createArenaCardCueState } from "@/game/arena3d/cues/createArenaCardCueState";
import { resolveArenaCuePace } from "@/game/arena3d/cues/resolveArenaCuePace";

type PaceParams = {
  cues: ArenaCardCueState;
  time: number;
  focus?: ArenaFocus;
  reducedMotion?: boolean;
};

const NO_FOCUS: ArenaFocus = { permanentId: undefined, level: 0 };

function resolvePace({ cues, time, focus = NO_FOCUS, reducedMotion = false }: PaceParams) {
  return resolveArenaCuePace({ permanents: [{ cues }], focus, time, reducedMotion });
}

function buildLinkedCue(channelAt: number): ArenaCardCueState {
  const base = createArenaCardCueState();
  return { cue: { ...base.cue, channel: ArenaCardChannel.LINKED }, timeline: { ...base.timeline, channelAt } };
}

describe("resolving the arena cue frame pace", () => {
  it("renders at full rate while a linked cue rises", () => {
    expect(resolvePace({ cues: buildLinkedCue(0), time: 0.1 })).toBe(ArenaCuePace.TRANSITION.value);
  });

  it("drops to the paced rate once the linked cue has settled", () => {
    expect(resolvePace({ cues: buildLinkedCue(0), time: 5 })).toBe(ArenaCuePace.SETTLED.value);
  });

  it("returns to full rate when a settled card lands or shakes", () => {
    const linked = buildLinkedCue(0);
    const shaking = { ...linked, timeline: { ...linked.timeline, shakeAt: 5 } };
    const landing = { ...linked, timeline: { ...linked.timeline, landingAt: 5 } };

    expect(resolvePace({ cues: shaking, time: 5.1 })).toBe(ArenaCuePace.TRANSITION.value);
    expect(resolvePace({ cues: landing, time: 5.6 })).toBe(ArenaCuePace.TRANSITION.value);
  });

  it("keeps full rate while the effect focus fades", () => {
    const focus = { permanentId: "source", level: 0.5 };

    expect(resolvePace({ cues: buildLinkedCue(0), time: 5, focus })).toBe(ArenaCuePace.TRANSITION.value);
  });

  it("idles with a settled focus and no lit card", () => {
    const focus = { permanentId: "source", level: 1 };

    expect(resolvePace({ cues: createArenaCardCueState(), time: 5, focus })).toBe(ArenaCuePace.IDLE.value);
  });

  it("idles under reduced motion once the focus has settled", () => {
    expect(resolvePace({ cues: buildLinkedCue(0), time: 0.1, reducedMotion: true })).toBe(ArenaCuePace.IDLE.value);
  });
});
