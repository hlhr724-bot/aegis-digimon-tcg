import { describe, expect, it } from "vitest";
import { computeArenaFieldInsetTop } from "@/game/arena3d/field/computeArenaFieldInsetTop";

const FIELD = { top: 70, height: 400 };

describe("computeArenaFieldInsetTop", () => {
  it("returns no inset when every overlay ends above the field", () => {
    expect(computeArenaFieldInsetTop({ field: FIELD, overlays: [{ top: 0, bottom: 69, height: 69 }] })).toBe(0);
  });

  it("insets below an overlay that reaches into the field, plus a gap", () => {
    expect(computeArenaFieldInsetTop({ field: FIELD, overlays: [{ top: 10, bottom: 110, height: 100 }] })).toBe(46);
  });

  it("ignores hidden overlays and overlays that start in the lower half", () => {
    const overlays = [
      { top: 20, bottom: 300, height: 0 },
      { top: 300, bottom: 360, height: 60 },
    ];
    expect(computeArenaFieldInsetTop({ field: FIELD, overlays })).toBe(0);
  });

  it("caps the inset so a tall overlay cannot collapse the field", () => {
    expect(computeArenaFieldInsetTop({ field: FIELD, overlays: [{ top: 0, bottom: 260, height: 260 }] })).toBe(120);
  });
});
