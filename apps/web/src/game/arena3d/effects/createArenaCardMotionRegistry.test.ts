import { describe, expect, it } from "vitest";
import { ArenaCardMotionKind } from "@/game/arena3d/effects/ArenaCardMotionKind";
import {
  createArenaCardMotionRegistry,
  type ArenaCardMotionSample,
} from "@/game/arena3d/effects/createArenaCardMotionRegistry";

function createSample(): ArenaCardMotionSample {
  return { offsetX: 0, offsetZ: 0, lift: 0, tilt: 0, roll: 0, spin: 0, scale: 1, flash: 0 };
}

describe("arena card motions", () => {
  it("moves an attacker toward its target at the strike and returns it to rest", () => {
    const registry = createArenaCardMotionRegistry();
    registry.add({
      permanentId: "perm-1",
      kind: ArenaCardMotionKind.LUNGE,
      startedAt: 10,
      directionX: 0,
      directionZ: -1,
      distance: 4,
    });
    const strike = ArenaCardMotionKind.LUNGE.keyframes[2];
    const sample = createSample();
    expect(registry.sample("perm-1", 10 + strike.at * ArenaCardMotionKind.LUNGE.durationSeconds, sample)).toBe(true);
    expect(sample.offsetZ).toBeCloseTo(-4 * strike.along, 5);
    expect(sample.lift).toBeGreaterThan(0);
    registry.sample("perm-1", 12, sample);
    expect(sample.offsetZ).toBe(0);
    expect(sample.scale).toBe(1);
  });

  it("starts a landing card slightly above the table", () => {
    const registry = createArenaCardMotionRegistry();
    registry.add({
      permanentId: "perm-2",
      kind: ArenaCardMotionKind.DROP,
      startedAt: 5,
      directionX: 0,
      directionZ: 0,
      distance: 0,
    });
    const sample = createSample();
    registry.sample("perm-2", 5, sample);
    expect(sample.lift).toBe(ArenaCardMotionKind.DROP.keyframes[0].lift);
    expect(sample.lift).toBeGreaterThan(0);
  });

  it("reports busy until the last motion ends", () => {
    const registry = createArenaCardMotionRegistry();
    registry.add({
      permanentId: "perm-3",
      kind: ArenaCardMotionKind.KNOCKBACK,
      startedAt: 1,
      directionX: 1,
      directionZ: 0,
      distance: 1,
    });
    expect(registry.isBusy(1.5)).toBe(true);
    expect(registry.isBusy(3)).toBe(false);
  });
});
