import { describe, expect, it } from "vitest";
import { twoRowsFit } from "./twoRowsFit";

describe("twoRowsFit", () => {
  it("allows two rows when the stacked card keeps 80% of the one-row card", () => {
    expect(twoRowsFit({ stackedWidth: 93, sideBySideWidth: 116, coarsePointer: false })).toBe(true);
    expect(twoRowsFit({ stackedWidth: 92, sideBySideWidth: 116, coarsePointer: false })).toBe(false);
  });

  it("requires a pointer floor of 84px even when the ratio passes", () => {
    expect(twoRowsFit({ stackedWidth: 84, sideBySideWidth: 84, coarsePointer: false })).toBe(true);
    expect(twoRowsFit({ stackedWidth: 83, sideBySideWidth: 84, coarsePointer: false })).toBe(false);
  });

  it("lowers the floor to 64px for a coarse pointer", () => {
    expect(twoRowsFit({ stackedWidth: 64, sideBySideWidth: 76, coarsePointer: true })).toBe(true);
    expect(twoRowsFit({ stackedWidth: 63, sideBySideWidth: 76, coarsePointer: true })).toBe(false);
    expect(twoRowsFit({ stackedWidth: 70, sideBySideWidth: 76, coarsePointer: false })).toBe(false);
  });

  it("keeps two rows below the floor when one row would draw smaller cards", () => {
    expect(twoRowsFit({ stackedWidth: 76, sideBySideWidth: 70, coarsePointer: false })).toBe(true);
    expect(twoRowsFit({ stackedWidth: 76, sideBySideWidth: 77, coarsePointer: false })).toBe(false);
  });
});
