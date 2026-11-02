import { describe, expect, it } from "vitest";
import { Arena3dDeviceClass } from "@/game/arena3d/quality/Arena3dDeviceClass";
import { Arena3dQuality } from "@/game/arena3d/quality/Arena3dQuality";
import { AUTO_ARENA_3D_QUALITY } from "@/game/arena3d/quality/Arena3dQualityChoice";
import { resolveArena3dQuality } from "@/game/arena3d/quality/resolveArena3dQuality";

const DESKTOP = Arena3dDeviceClass.DESKTOP;
const PHONE = Arena3dDeviceClass.PHONE;

describe("arena 3D quality resolution", () => {
  it("lowers the automatic tier one step per downgrade and never below low", () => {
    const probed = Arena3dQuality.HIGH.value;
    expect(resolveArena3dQuality({ choice: AUTO_ARENA_3D_QUALITY, probed, downgrades: 1, deviceClass: DESKTOP })).toBe(
      Arena3dQuality.MEDIUM,
    );
    expect(resolveArena3dQuality({ choice: AUTO_ARENA_3D_QUALITY, probed, downgrades: 5, deviceClass: DESKTOP })).toBe(
      Arena3dQuality.LOW,
    );
  });

  it("keeps a tier the player picked", () => {
    expect(
      resolveArena3dQuality({
        choice: Arena3dQuality.HIGH.value,
        probed: Arena3dQuality.LOW.value,
        downgrades: 2,
        deviceClass: DESKTOP,
      }),
    ).toBe(Arena3dQuality.HIGH);
  });

  it("applies touch budgets to every tier on phones and tablets", () => {
    const low = resolveArena3dQuality({
      choice: AUTO_ARENA_3D_QUALITY,
      probed: Arena3dQuality.LOW.value,
      downgrades: 0,
      deviceClass: PHONE,
    });
    const medium = resolveArena3dQuality({
      choice: AUTO_ARENA_3D_QUALITY,
      probed: Arena3dQuality.HIGH.value,
      downgrades: 1,
      deviceClass: Arena3dDeviceClass.TABLET,
    });
    const high = resolveArena3dQuality({
      choice: Arena3dQuality.HIGH.value,
      probed: Arena3dQuality.LOW.value,
      downgrades: 0,
      deviceClass: PHONE,
    });
    expect(low).toMatchObject({ value: Arena3dQuality.LOW.value, maxDpr: 1.5, textureWidth: 384 });
    expect(low.textureBudgetBytes).toBeLessThan(Arena3dQuality.LOW.textureBudgetBytes);
    expect(medium).toMatchObject({ value: Arena3dQuality.MEDIUM.value, maxDpr: 2, textureWidth: 512, bloom: false });
    expect(medium.floorSegments).toBeLessThan(Arena3dQuality.MEDIUM.floorSegments);
    expect(medium.antialias).toBe(low.antialias);
    expect(high.textureBudgetBytes).toBeLessThan(Arena3dQuality.HIGH.textureBudgetBytes);
    expect(high.floorSegments).toBeLessThan(Arena3dQuality.HIGH.floorSegments);
  });

  it("returns the same touch entry on every call so the memoized scene does not re-render", () => {
    const params: Parameters<typeof resolveArena3dQuality>[0] = {
      choice: AUTO_ARENA_3D_QUALITY,
      probed: Arena3dQuality.MEDIUM.value,
      downgrades: 0,
      deviceClass: PHONE,
    };
    expect(resolveArena3dQuality(params)).toBe(resolveArena3dQuality({ ...params }));
  });
});
