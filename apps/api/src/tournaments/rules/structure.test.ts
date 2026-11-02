import { describe, expect, it } from "vitest";
import { estimatedTopCutSize, freezeStructure } from "./structure.js";

const SWISS_WITH_CUT = { structure: "swiss", topCut: true } as const;
const SWISS_NO_CUT = { structure: "swiss", topCut: false } as const;
const BRACKET = { structure: "single_elimination", topCut: false } as const;

describe("freezeStructure", () => {
  it.each([
    [8, 3, 0],
    [9, 4, 2],
    [16, 4, 2],
    [17, 5, 4],
    [32, 5, 4],
    [33, 6, 8],
    [128, 7, 8],
    [129, 8, 16],
    [512, 9, 16],
    [513, 10, 32],
  ])("freezes %i participants as %i Swiss rounds and a Top %i", (participants, rounds, cut) => {
    expect(freezeStructure(participants, SWISS_WITH_CUT)).toEqual({ swissRounds: rounds, topCutSize: cut });
  });

  it("reports a zero cut rather than a phase when the Top Cut flag is on below nine participants", () => {
    expect(freezeStructure(8, SWISS_WITH_CUT).topCutSize).toBe(0);
    expect(estimatedTopCutSize(8, SWISS_WITH_CUT)).toBe(0);
    expect(estimatedTopCutSize(9, SWISS_WITH_CUT)).toBe(2);
  });

  it("distinguishes a field too small to cut from a structure that has no cut at all", () => {
    // Only the first should raise the UI's "the flag will not create a phase" warning.
    expect(estimatedTopCutSize(8, SWISS_WITH_CUT)).toBe(0);
    expect(estimatedTopCutSize(8, SWISS_NO_CUT)).toBeNull();
    expect(estimatedTopCutSize(8, BRACKET)).toBeNull();
  });

  it("leaves the cut unset, not zero, when the flag is off", () => {
    expect(freezeStructure(64, SWISS_NO_CUT)).toEqual({ swissRounds: 6, topCutSize: null });
  });

  it("freezes nothing for a single-elimination event, which has no Swiss phase", () => {
    expect(freezeStructure(64, BRACKET)).toEqual({ swissRounds: null, topCutSize: null });
  });

  it("is pure: the same field always freezes the same shape", () => {
    expect(freezeStructure(100, SWISS_WITH_CUT)).toEqual(freezeStructure(100, SWISS_WITH_CUT));
  });

  it("clamps a nonsensical field instead of producing a fractional round count", () => {
    expect(freezeStructure(-5, SWISS_WITH_CUT)).toEqual({ swissRounds: 3, topCutSize: 0 });
    expect(freezeStructure(16.9, SWISS_WITH_CUT)).toEqual({ swissRounds: 4, topCutSize: 2 });
  });
});

describe("freezeStructure organizer settings", () => {
  it("plays a full round robin: one round per opponent, plus one bye round for an odd field", () => {
    expect(freezeStructure(6, { structure: "round_robin", topCut: false })).toEqual({
      swissRounds: 5,
      topCutSize: null,
    });
    expect(freezeStructure(5, { structure: "round_robin", topCut: true })).toEqual({ swissRounds: 5, topCutSize: 0 });
  });

  it("uses the organizer's Swiss round count instead of the table", () => {
    expect(freezeStructure(20, { structure: "swiss", topCut: false, rounds: 3 }).swissRounds).toBe(3);
  });

  it("uses the organizer's Top Cut size, halved until it fits the field", () => {
    expect(freezeStructure(6, { structure: "swiss", topCut: true, topCutSize: 4 }).topCutSize).toBe(4);
    expect(freezeStructure(5, { structure: "round_robin", topCut: true, topCutSize: 8 }).topCutSize).toBe(4);
    expect(freezeStructure(1, { structure: "swiss", topCut: true, topCutSize: 2 }).topCutSize).toBe(0);
  });
});
