import { describe, expect, it } from "vitest";
import { isValidSlotSelection } from "#shared/protocol/isValidSlotSelection";

const slots = [
  { description: "first", candidateInstanceIds: ["shared", "first-only"], max: 1, isMandatory: true },
  { description: "second", candidateInstanceIds: ["shared", "second-only"], max: 1, isMandatory: true },
];

describe("slot selection validation", () => {
  it("accepts one card per slot", () => {
    expect(isValidSlotSelection({ slots, selections: [["first-only"], ["shared"]] })).toBe(true);
    expect(isValidSlotSelection({ slots, selections: [["shared"], ["second-only"]] })).toBe(true);
  });

  it("refuses one card used for two slots", () => {
    expect(isValidSlotSelection({ slots, selections: [["shared"], ["shared"]] })).toBe(false);
  });

  it("refuses a card outside its slot, too many cards and a skipped mandatory slot", () => {
    expect(isValidSlotSelection({ slots, selections: [["second-only"], ["shared"]] })).toBe(false);
    expect(isValidSlotSelection({ slots, selections: [["shared", "first-only"], ["second-only"]] })).toBe(false);
    expect(isValidSlotSelection({ slots, selections: [[], ["shared"]] })).toBe(false);
    expect(isValidSlotSelection({ slots, selections: [["first-only"]] })).toBe(false);
  });

  it("lets a mandatory slot stay empty only when an earlier slot used its last card", () => {
    const narrow = [slots[0]!, { ...slots[1]!, candidateInstanceIds: ["shared"] }];
    expect(isValidSlotSelection({ slots: narrow, selections: [["shared"], []] })).toBe(true);
    expect(isValidSlotSelection({ slots: narrow, selections: [["first-only"], []] })).toBe(false);
  });

  it("lets an optional slot stay empty", () => {
    const optional = [slots[0]!, { ...slots[1]!, isMandatory: false }];
    expect(isValidSlotSelection({ slots: optional, selections: [["first-only"], []] })).toBe(true);
  });
});
