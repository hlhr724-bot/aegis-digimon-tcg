import { describe, expect, it } from "vitest";
import { Arena3dDeviceClass } from "@/game/arena3d/quality/Arena3dDeviceClass";
import type { Arena3dDeviceSignals } from "@/game/arena3d/quality/Arena3dDeviceSignals";
import { getArena3dDeviceClass } from "@/game/arena3d/quality/getArena3dDeviceClass";

const TOUCH: Arena3dDeviceSignals = {
  maxTextureSize: 8192,
  rendererName: "Apple GPU",
  hardwareConcurrency: 4,
  deviceMemoryGigabytes: undefined,
  coarsePointer: true,
  finePointerAvailable: false,
  screenShortSide: 390,
};

describe("arena 3D device class", () => {
  it("separates phones from tablets by the short screen side", () => {
    expect(getArena3dDeviceClass(TOUCH)).toBe(Arena3dDeviceClass.PHONE);
    expect(getArena3dDeviceClass({ ...TOUCH, screenShortSide: 820 })).toBe(Arena3dDeviceClass.TABLET);
  });

  it("keeps a stylus phone that reports a fine pointer on phone budgets", () => {
    expect(getArena3dDeviceClass({ ...TOUCH, finePointerAvailable: true, screenShortSide: 384 })).toBe(
      Arena3dDeviceClass.PHONE,
    );
  });

  it("treats a tablet with a fine pointer, a mouse-first device, or no probe as a desktop", () => {
    expect(getArena3dDeviceClass({ ...TOUCH, finePointerAvailable: true, screenShortSide: 820 })).toBe(
      Arena3dDeviceClass.DESKTOP,
    );
    expect(getArena3dDeviceClass({ ...TOUCH, coarsePointer: false })).toBe(Arena3dDeviceClass.DESKTOP);
    expect(getArena3dDeviceClass(undefined)).toBe(Arena3dDeviceClass.DESKTOP);
  });
});
