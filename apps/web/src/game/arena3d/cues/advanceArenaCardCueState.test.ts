import { describe, expect, it } from "vitest";
import { advanceArenaCardCueState } from "@/game/arena3d/cues/advanceArenaCardCueState";
import { ArenaCardChannel } from "@/game/arena3d/cues/ArenaCardChannel";
import type { ArenaCardCue } from "@/game/arena3d/cues/ArenaCardCue";
import { ArenaCardTint } from "@/game/arena3d/cues/ArenaCardTint";
import { createArenaCardCueState } from "@/game/arena3d/cues/createArenaCardCueState";

function buildCue(overrides: Partial<ArenaCardCue>): ArenaCardCue {
  return { ...createArenaCardCueState().cue, ...overrides };
}

describe("arena card cue timeline", () => {
  it("starts the channel and the activation flash when a card becomes an effect source", () => {
    const state = advanceArenaCardCueState({
      previous: createArenaCardCueState(),
      cue: buildCue({ channel: ArenaCardChannel.SOURCE }),
      time: 4,
    });

    expect(state.timeline.channelAt).toBe(4);
    expect(state.timeline.sourceAt).toBe(4);
  });

  it("keeps the channel start when the source becomes the linked clause", () => {
    const source = advanceArenaCardCueState({
      previous: createArenaCardCueState(),
      cue: buildCue({ channel: ArenaCardChannel.SOURCE }),
      time: 4,
    });
    const linked = advanceArenaCardCueState({
      previous: source,
      cue: buildCue({ channel: ArenaCardChannel.LINKED }),
      time: 4.7,
    });

    expect(linked.timeline.channelAt).toBe(4);
    expect(linked.timeline.sourceAt).toBe(4);
  });

  it("restarts the tint when a different status lands and holds it while the same one stays", () => {
    const buff = advanceArenaCardCueState({
      previous: createArenaCardCueState(),
      cue: buildCue({ tint: ArenaCardTint.BUFF }),
      time: 1,
    });
    const held = advanceArenaCardCueState({ previous: buff, cue: buildCue({ tint: ArenaCardTint.BUFF }), time: 1.2 });
    const debuff = advanceArenaCardCueState({
      previous: held,
      cue: buildCue({ tint: ArenaCardTint.DEBUFF }),
      time: 1.4,
    });

    expect(held.timeline.tintAt).toBe(1);
    expect(debuff.timeline.tintAt).toBe(1.4);
  });

  it("records shake and landing only on their rising edge", () => {
    const first = advanceArenaCardCueState({
      previous: createArenaCardCueState(),
      cue: buildCue({ shaking: true, landing: true }),
      time: 2,
    });
    const second = advanceArenaCardCueState({
      previous: first,
      cue: buildCue({ shaking: true, landing: true }),
      time: 3,
    });

    expect(second.timeline.shakeAt).toBe(2);
    expect(second.timeline.landingAt).toBe(2);
  });
});
