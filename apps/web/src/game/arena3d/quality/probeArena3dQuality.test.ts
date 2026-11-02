import { describe, expect, it } from "vitest";
import type { Arena3dDeviceSignals } from "@/game/arena3d/quality/Arena3dDeviceSignals";
import { Arena3dQuality } from "@/game/arena3d/quality/Arena3dQuality";
import { probeArena3dQuality } from "@/game/arena3d/quality/probeArena3dQuality";

const DESKTOP: Arena3dDeviceSignals = {
  maxTextureSize: 16384,
  rendererName: "ANGLE (NVIDIA GeForce RTX 3070)",
  hardwareConcurrency: 12,
  deviceMemoryGigabytes: 8,
  coarsePointer: false,
  finePointerAvailable: true,
  screenShortSide: 1080,
};

const PHONE: Arena3dDeviceSignals = {
  maxTextureSize: 8192,
  rendererName: "Adreno (TM) 740",
  hardwareConcurrency: 8,
  deviceMemoryGigabytes: 8,
  coarsePointer: true,
  finePointerAvailable: false,
  screenShortSide: 412,
};

const IPHONE: Arena3dDeviceSignals = {
  ...PHONE,
  rendererName: "Apple GPU",
  hardwareConcurrency: 4,
  deviceMemoryGigabytes: undefined,
  screenShortSide: 390,
};

const IPAD: Arena3dDeviceSignals = { ...IPHONE, screenShortSide: 820 };

describe("arena 3D quality probe", () => {
  it("starts a discrete desktop GPU on high and a software renderer on low", () => {
    expect(probeArena3dQuality(DESKTOP)).toBe(Arena3dQuality.HIGH.value);
    expect(probeArena3dQuality({ ...DESKTOP, rendererName: "Google SwiftShader" })).toBe(Arena3dQuality.LOW.value);
  });

  it("starts integrated desktop GPUs and touch laptops on medium", () => {
    expect(probeArena3dQuality({ ...DESKTOP, rendererName: "Intel Iris Xe" })).toBe(Arena3dQuality.MEDIUM.value);
    expect(probeArena3dQuality({ ...DESKTOP, coarsePointer: true })).toBe(Arena3dQuality.MEDIUM.value);
  });

  it("starts iPhones, iPads, and flagship Android phones on medium", () => {
    expect(probeArena3dQuality(IPHONE)).toBe(Arena3dQuality.MEDIUM.value);
    expect(probeArena3dQuality(IPAD)).toBe(Arena3dQuality.MEDIUM.value);
    expect(probeArena3dQuality(PHONE)).toBe(Arena3dQuality.MEDIUM.value);
    expect(probeArena3dQuality({ ...PHONE, rendererName: "Mali-G715" })).toBe(Arena3dQuality.MEDIUM.value);
  });

  it("starts entry-level and low-memory phones on low", () => {
    expect(probeArena3dQuality({ ...PHONE, rendererName: "Mali-G52" })).toBe(Arena3dQuality.LOW.value);
    expect(probeArena3dQuality({ ...PHONE, rendererName: "Adreno (TM) 506" })).toBe(Arena3dQuality.LOW.value);
    expect(probeArena3dQuality({ ...PHONE, rendererName: "PowerVR Rogue GE8320" })).toBe(Arena3dQuality.LOW.value);
    expect(probeArena3dQuality({ ...PHONE, deviceMemoryGigabytes: 4 })).toBe(Arena3dQuality.LOW.value);
    expect(probeArena3dQuality({ ...PHONE, hardwareConcurrency: 4 })).toBe(Arena3dQuality.LOW.value);
  });

  it("never starts a touch-first device on high", () => {
    expect(probeArena3dQuality({ ...PHONE, rendererName: "ANGLE (NVIDIA GeForce RTX 3070)" })).toBe(
      Arena3dQuality.MEDIUM.value,
    );
  });
});
