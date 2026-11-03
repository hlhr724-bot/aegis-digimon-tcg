import { describe, expect, it } from "vitest";
import { ArenaCardChannel } from "@/game/arena3d/cues/ArenaCardChannel";
import type { ArenaCueElement } from "@/game/arena3d/cues/ArenaCueElement";
import { ArenaCardTint } from "@/game/arena3d/cues/ArenaCardTint";
import { readArenaProxyCue } from "@/game/arena3d/cues/readArenaProxyCue";

type FakeParams = {
  classes?: readonly string[];
  children?: readonly string[];
};

function buildElement({ classes = [], children = [] }: FakeParams): ArenaCueElement {
  return {
    classList: { contains: (token) => classes.includes(token) },
    querySelector: (selector) =>
      selector
        .split(",")
        .map((part) => part.trim().replace(/^\./, ""))
        .some((name) => children.includes(name))
        ? {}
        : null,
  };
}

describe("reading a field proxy's cue", () => {
  it("reads an effect source before a linked clause", () => {
    const cue = readArenaProxyCue({
      element: buildElement({ classes: ["game-permanent--effect-source", "game-permanent--effect-linked"] }),
      offered: false,
    });

    expect(cue.channel).toBe(ArenaCardChannel.SOURCE);
  });

  it("reads a status pulse class before a DP change", () => {
    const cue = readArenaProxyCue({
      element: buildElement({ classes: ["game-permanent-freeze"], children: ["game-dp-pulse"] }),
      offered: false,
    });

    expect(cue.tint).toBe(ArenaCardTint.FREEZE);
  });

  it("reads a DP loss as a debuff and a DP gain as a buff", () => {
    const loss = readArenaProxyCue({
      element: buildElement({ children: ["game-dp-pulse", "game-dp-pulse--debuff"] }),
      offered: false,
    });
    const gain = readArenaProxyCue({ element: buildElement({ children: ["game-dp-pulse"] }), offered: false });

    expect(loss.tint).toBe(ArenaCardTint.DEBUFF);
    expect(gain.tint).toBe(ArenaCardTint.BUFF);
  });

  it("reads shake, landing and the offered target", () => {
    const cue = readArenaProxyCue({
      element: buildElement({
        classes: ["game-permanent-shake"],
        children: ["game-card-landing"],
      }),
      offered: true,
    });

    expect(cue).toMatchObject({ shaking: true, landing: true, offered: true, channel: undefined });
  });

  it("reads the summoning ring a card wears while it cannot attack", () => {
    const sick = readArenaProxyCue({ element: buildElement({ children: ["game-summoning-ring"] }), offered: false });
    const ready = readArenaProxyCue({ element: buildElement({}), offered: false });

    expect(sick.summoning).toBe(true);
    expect(ready.summoning).toBe(false);
  });
});
