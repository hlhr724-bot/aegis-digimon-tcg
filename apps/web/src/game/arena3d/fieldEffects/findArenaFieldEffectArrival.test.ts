import { describe, expect, it } from "vitest";
import { findArenaFieldEffectArrival } from "@/game/arena3d/fieldEffects/findArenaFieldEffectArrival";
import { ArenaFieldEffectTone } from "@/game/arena3d/slots/ArenaFieldEffectTone";

const gain = { key: "dp:1000", harmful: false };
const loss = { key: "dp:-2000", harmful: true };

describe("findArenaFieldEffectArrival", () => {
  it("reports nothing when the effects stay the same or end", () => {
    expect(findArenaFieldEffectArrival({ previous: [gain], next: [gain] })).toBe(ArenaFieldEffectTone.NONE.value);
    expect(findArenaFieldEffectArrival({ previous: [gain, loss], next: [gain] })).toBe(ArenaFieldEffectTone.NONE.value);
  });

  it("reports a helpful arrival for a new gain", () => {
    expect(findArenaFieldEffectArrival({ previous: [], next: [gain] })).toBe(ArenaFieldEffectTone.HELPFUL.value);
  });

  it("counts a second copy of the same effect as an arrival", () => {
    expect(findArenaFieldEffectArrival({ previous: [gain], next: [gain, gain] })).toBe(
      ArenaFieldEffectTone.HELPFUL.value,
    );
  });

  it("lets a harmful arrival win over a helpful one", () => {
    expect(findArenaFieldEffectArrival({ previous: [], next: [gain, loss] })).toBe(ArenaFieldEffectTone.HARMFUL.value);
  });
});
