import { describe, expect, it } from "vitest";
import { ArenaCardChannel } from "@/game/arena3d/cues/ArenaCardChannel";
import type { ArenaCardCueState } from "@/game/arena3d/cues/ArenaCardCue";
import { ArenaCueDecalKind } from "@/game/arena3d/cues/ArenaCueDecalKind";
import { collectArenaCueDecals } from "@/game/arena3d/cues/collectArenaCueDecals";
import { createArenaCardCueState } from "@/game/arena3d/cues/createArenaCardCueState";

type PermanentParams = {
  cues: ArenaCardCueState;
  hidden?: boolean;
};

function buildPermanent({ cues, hidden = false }: PermanentParams) {
  return { top: { x: 1, z: 2, width: 1.2, yaw: 0 }, hidden, opacity: 1, cues };
}

function collectKinds(cues: ArenaCardCueState, time: number, reducedMotion = false): string[] {
  return collectArenaCueDecals({
    permanents: [buildPermanent({ cues })],
    time,
    reducedMotion,
    arrivalColor: "#fff",
  }).map((decal) => decal.kind.value);
}

describe("collecting arena cue decals", () => {
  it("draws a floor ring and a light column under an effect source", () => {
    const base = createArenaCardCueState();
    const cues = {
      cue: { ...base.cue, channel: ArenaCardChannel.SOURCE },
      timeline: { ...base.timeline, channelAt: 0 },
    };

    expect(collectKinds(cues, 1)).toEqual([ArenaCueDecalKind.CHANNEL.value, ArenaCueDecalKind.COLUMN.value]);
  });

  it("swirls light into the slot while the card lands", () => {
    const base = createArenaCardCueState();
    const cues = { cue: { ...base.cue, landing: true }, timeline: { ...base.timeline, landingAt: 0 } };

    expect(collectKinds(cues, 0.3)).toEqual([ArenaCueDecalKind.ARRIVAL.value]);
    expect(collectKinds(cues, 1)).toEqual([]);
  });

  it("drops the arrival swirl under reduced motion", () => {
    const base = createArenaCardCueState();
    const cues = { cue: { ...base.cue, landing: true }, timeline: { ...base.timeline, landingAt: 0 } };

    expect(collectKinds(cues, 0.3, true)).toEqual([]);
  });

  it("skips hidden cards", () => {
    const base = createArenaCardCueState();
    const decals = collectArenaCueDecals({
      permanents: [buildPermanent({ cues: { ...base, cue: { ...base.cue, landing: true } }, hidden: true })],
      time: 1,
      reducedMotion: false,
      arrivalColor: "#fff",
    });

    expect(decals).toEqual([]);
  });
});
