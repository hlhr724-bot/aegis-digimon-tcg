import { describe, expect, it } from "vitest";
import { BoardStyle } from "@/game/arena3d/boardStyle/BoardStyle";
import { resolveBoardStyle } from "@/game/arena3d/boardStyle/resolveBoardStyle";

describe("resolveBoardStyle", () => {
  it("keeps the classic board unless the player chose the 3D arena", () => {
    expect(resolveBoardStyle({ preference: BoardStyle.CLASSIC.value, webGlAvailable: true })).toBe(
      BoardStyle.CLASSIC.value,
    );
  });

  it("uses the 3D arena with WebGL on any screen orientation", () => {
    expect(resolveBoardStyle({ preference: BoardStyle.ARENA_3D.value, webGlAvailable: true })).toBe(
      BoardStyle.ARENA_3D.value,
    );
  });

  it("falls back to the classic board without WebGL", () => {
    expect(resolveBoardStyle({ preference: BoardStyle.ARENA_3D.value, webGlAvailable: false })).toBe(
      BoardStyle.CLASSIC.value,
    );
  });
});
