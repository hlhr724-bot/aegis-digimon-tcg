import { describe, expect, it } from "vitest";
import {
  CENTRED_AVATAR_CROP,
  MAX_AVATAR_ZOOM,
  MIN_AVATAR_ZOOM,
  clampAvatarCrop,
  clampOffset,
  clampZoom,
  cropSide,
  cropSourceRect,
  dragToOffset,
} from "./normalizeAvatarImage";

describe("avatar crop geometry", () => {
  it("reads a square window from the shortest edge", () => {
    expect(cropSide(800, 400, 1)).toBe(400);
    expect(cropSide(400, 800, 1)).toBe(400);
    expect(cropSide(400, 400, MIN_AVATAR_ZOOM)).toBe(400);
  });

  it("shrinks the window as the player zooms in, and never past the limits", () => {
    expect(cropSide(400, 400, 2)).toBe(200);
    expect(cropSide(400, 400, 99)).toBe(400 / MAX_AVATAR_ZOOM);
    expect(cropSide(400, 400, 0)).toBe(400);
  });

  it("centres a centred crop", () => {
    expect(cropSourceRect(CENTRED_AVATAR_CROP, 800, 400)).toEqual({ sx: 200, sy: 0, side: 400 });
  });

  it("reaches both edges at the ends of the offset range", () => {
    const left = cropSourceRect({ zoom: 1, offsetX: -1, offsetY: 0 }, 800, 400);
    const right = cropSourceRect({ zoom: 1, offsetX: 1, offsetY: 0 }, 800, 400);
    expect(left.sx).toBe(0);
    expect(right.sx).toBe(400);
    expect(right.sx + right.side).toBe(800);
  });

  it("does not pan an axis that has no room to pan", () => {
    const rect = cropSourceRect({ zoom: 1, offsetX: 0, offsetY: 1 }, 800, 400);
    expect(rect.sy).toBe(0);
  });

  it("treats a nonsense offset or zoom as centred", () => {
    expect(clampOffset(Number.NaN)).toBe(0);
    expect(clampOffset(9)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(MIN_AVATAR_ZOOM);
    expect(clampAvatarCrop({ zoom: Number.NaN, offsetX: Number.NaN, offsetY: -9 })).toEqual({
      zoom: MIN_AVATAR_ZOOM,
      offsetX: 0,
      offsetY: -1,
    });
  });

  it("moves the window opposite the drag, proportionally to the stage", () => {
    const stage = 300;
    // 800x400 at zoom 1 shows a 400px square with 200px of horizontal slack each side. The stage is
    // 300px wide, so one stage pixel is 400/300 source pixels: dragging 75px right moves the window
    // 100 source pixels left, which is half of the slack.
    const next = dragToOffset(CENTRED_AVATAR_CROP, 75, 0, 800, 400, stage);
    expect(next.offsetX).toBeCloseTo(-0.5, 5);
    expect(next.offsetY).toBe(0);
  });

  it("clamps a long drag instead of letting the window leave the picture", () => {
    const next = dragToOffset(CENTRED_AVATAR_CROP, -5000, 0, 800, 400, 300);
    expect(next.offsetX).toBe(1);
  });

  it("ignores a drag before the stage has been measured", () => {
    const next = dragToOffset(CENTRED_AVATAR_CROP, 40, 40, 800, 400, 0);
    expect(next).toEqual({ offsetX: 0, offsetY: 0 });
  });
});
