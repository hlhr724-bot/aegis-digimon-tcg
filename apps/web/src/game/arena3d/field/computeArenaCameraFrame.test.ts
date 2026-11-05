import { describe, expect, it } from "vitest";
import { computeArenaCameraFrame } from "@/game/arena3d/field/computeArenaCameraFrame";
import { createArenaFrameCamera } from "@/game/arena3d/field/createArenaFrameCamera";
import { projectArenaPoint } from "@/game/arena3d/field/projectArenaPoint";
import { ArenaLayoutVariant } from "@/game/arena3d/field/ArenaLayoutVariant";
import { ArenaZone } from "@/game/arena3d/ArenaZone";
import { Side } from "@/game/side";

const CASES = [
  {
    name: "desktop",
    canvasWidth: 1600,
    canvasHeight: 900,
    field: { left: 120, top: 90, width: 1360, height: 640 },
    layout: ArenaLayoutVariant.WIDE,
  },
  {
    name: "small desktop",
    canvasWidth: 1024,
    canvasHeight: 716,
    field: { left: 0, top: 70, width: 1024, height: 490 },
    layout: ArenaLayoutVariant.WIDE,
  },
  {
    name: "short desktop",
    canvasWidth: 1280,
    canvasHeight: 668,
    field: { left: 0, top: 70, width: 1280, height: 420 },
    layout: ArenaLayoutVariant.SHORT,
  },
  {
    name: "landscape phone",
    canvasWidth: 844,
    canvasHeight: 390,
    field: { left: 0, top: 88, width: 844, height: 244 },
    layout: ArenaLayoutVariant.SHORT,
  },
  {
    name: "portrait phone",
    canvasWidth: 390,
    canvasHeight: 844,
    field: { left: 0, top: 108, width: 390, height: 558 },
    layout: ArenaLayoutVariant.TALL,
  },
  {
    name: "portrait tablet",
    canvasWidth: 768,
    canvasHeight: 1024,
    field: { left: 0, top: 108, width: 768, height: 716 },
    layout: ArenaLayoutVariant.TALL,
  },
] as const;

describe.each(CASES)("computeArenaCameraFrame on a $name", ({ canvasWidth, canvasHeight, field, layout }) => {
  const frame = computeArenaCameraFrame({
    canvasWidth,
    canvasHeight,
    field,
    origin: field,
    layout,
    lanes: layout.lanes,
  });
  const camera = createArenaFrameCamera(frame);
  const { halfWidth, halfDepth } = layout.bounds;
  const corners = [
    projectArenaPoint({ frame, camera, x: -halfWidth, z: -halfDepth }),
    projectArenaPoint({ frame, camera, x: halfWidth, z: -halfDepth }),
    projectArenaPoint({ frame, camera, x: -halfWidth, z: halfDepth }),
    projectArenaPoint({ frame, camera, x: halfWidth, z: halfDepth }),
  ];

  it("puts the world origin at the center of the field", () => {
    const center = projectArenaPoint({ frame, camera, x: 0, z: 0 });
    expect(center.x).toBeCloseTo(field.width / 2, 0);
    expect(center.y).toBeCloseTo(field.height / 2, 0);
  });

  it("keeps every corner of the arena inside the field", () => {
    for (const point of corners) {
      expect(point.x).toBeGreaterThanOrEqual(-2);
      expect(point.x).toBeLessThanOrEqual(field.width + 2);
      expect(point.y).toBeGreaterThanOrEqual(-2);
      expect(point.y).toBeLessThanOrEqual(field.height + 2);
    }
  });

  it("nearly fills the field on its binding axis", () => {
    const width = Math.max(...corners.map((point) => point.x)) - Math.min(...corners.map((point) => point.x));
    const height = Math.max(...corners.map((point) => point.y)) - Math.min(...corners.map((point) => point.y));
    expect(Math.max(width / field.width, height / field.height)).toBeGreaterThan(0.9);
  });

  it("draws the opponent's side above the viewer's", () => {
    const opponent = projectArenaPoint({ frame, camera, x: 0, z: -3 });
    const viewer = projectArenaPoint({ frame, camera, x: 0, z: 3 });
    expect(opponent.y).toBeLessThan(viewer.y);
  });

  it("keeps the viewer's eggs and raising slots inside the field", () => {
    for (const zone of [ArenaZone.EGGS.value, ArenaZone.RAISING.value]) {
      const slot = layout.zones[`${Side.Viewer}:${zone}`]!;
      const point = projectArenaPoint({ frame, camera, x: slot.x, z: slot.z });
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(field.width);
      expect(point.y).toBeGreaterThan(field.height / 2);
      expect(point.y).toBeLessThan(field.height);
    }
  });

  it("keeps the frame's world layout", () => {
    expect(frame.layout).toBe(layout);
  });
});
