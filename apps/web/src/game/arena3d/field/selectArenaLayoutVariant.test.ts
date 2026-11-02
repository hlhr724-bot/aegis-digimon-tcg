import { describe, expect, it } from "vitest";
import { ArenaLayoutVariant } from "@/game/arena3d/field/ArenaLayoutVariant";
import { selectArenaLayoutVariant } from "@/game/arena3d/field/selectArenaLayoutVariant";

describe("selectArenaLayoutVariant", () => {
  it("uses the tall layout on a portrait screen", () => {
    expect(selectArenaLayoutVariant({ portrait: true, width: 390, height: 558 })).toBe(ArenaLayoutVariant.TALL);
    expect(selectArenaLayoutVariant({ portrait: true, width: 768, height: 716 })).toBe(ArenaLayoutVariant.TALL);
  });

  it("uses the short layout on a very wide field", () => {
    expect(selectArenaLayoutVariant({ portrait: false, width: 844, height: 244 })).toBe(ArenaLayoutVariant.SHORT);
    expect(selectArenaLayoutVariant({ portrait: false, width: 1280, height: 369 })).toBe(ArenaLayoutVariant.SHORT);
  });

  it("keeps the wide layout on tablets and desktops", () => {
    expect(selectArenaLayoutVariant({ portrait: false, width: 1024, height: 420 })).toBe(ArenaLayoutVariant.WIDE);
    expect(selectArenaLayoutVariant({ portrait: false, width: 1440, height: 552 })).toBe(ArenaLayoutVariant.WIDE);
    expect(selectArenaLayoutVariant({ portrait: false, width: 1920, height: 718 })).toBe(ArenaLayoutVariant.WIDE);
  });
});
