import { describe, expect, it } from "vitest";
import { shouldDeferArenaDomRead } from "@/game/arena3d/field/shouldDeferArenaDomRead";

const MUTATED_FRAME = { mutated: true, structural: false, deferredLastFrame: false, measured: true };

describe("deferring the arena DOM read", () => {
  it("defers the read in the frame right after a DOM mutation", () => {
    expect(shouldDeferArenaDomRead(MUTATED_FRAME)).toBe(true);
  });

  it("reads in a frame without a mutation", () => {
    expect(shouldDeferArenaDomRead({ ...MUTATED_FRAME, mutated: false })).toBe(false);
  });

  it("defers for one frame at most while mutations continue", () => {
    expect(shouldDeferArenaDomRead({ ...MUTATED_FRAME, deferredLastFrame: true })).toBe(false);
  });

  it("reads at once when the camera frame or board changed", () => {
    expect(shouldDeferArenaDomRead({ ...MUTATED_FRAME, structural: true })).toBe(false);
  });

  it("reads at once before any zone has been measured", () => {
    expect(shouldDeferArenaDomRead({ ...MUTATED_FRAME, measured: false })).toBe(false);
  });
});
