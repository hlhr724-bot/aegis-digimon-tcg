import { describe, expect, it } from "vitest";
import { parseManualIntent } from "#shared/manual/parseManualIntent";

const envelope = { type: "manual", requestId: "one", revision: 0 };

describe("manual command validation", () => {
  it.each([
    {
      ...envelope,
      command: { action: "modifiers", permanentId: "a", securityAttackModifier: 100, keywords: [], colors: [] },
    },
    {
      ...envelope,
      command: {
        action: "modifiers",
        permanentId: "a",
        securityAttackModifier: 0,
        keywords: ["constructor"],
        colors: [],
      },
    },
    {
      ...envelope,
      command: {
        action: "modifiers",
        permanentId: "a",
        securityAttackModifier: 0,
        keywords: [],
        colors: ["constructor"],
      },
    },
    { ...envelope, command: { action: "reveal", from: { zone: "hand" }, count: 0 } },
    { ...envelope, command: { action: "phase", phase: "None" } },
    { ...envelope, command: { action: "combat", stage: "constructor" } },
    { ...envelope, command: { action: "statuses", permanentId: "a", statuses: ["sick", "sick"] } },
    { ...envelope, command: { action: "statuses", permanentId: "a", statuses: ["constructor"] } },
    { ...envelope, command: { action: "signal", from: { zone: "hand" }, targetPermanentId: "a", targetSeat: 1 } },
    { ...envelope, command: { action: "signal", from: { zone: "hand" }, targetSeat: -1 } },
    { ...envelope, command: { action: "proposeRestart", firstSeat: 2 } },
    { ...envelope, command: { action: "breeding", choice: "constructor" } },
    null,
    [],
    {},
    { ...envelope, command: { action: "constructor" } },
    { ...envelope, command: { action: "draw", count: -1 } },
    { ...envelope, command: { action: "memory", value: Number.NaN } },
    { ...envelope, command: { action: "dp", permanentId: "a", value: Number.POSITIVE_INFINITY } },
    {
      ...envelope,
      command: {
        action: "move",
        wholePile: false,
        from: { zone: "hand", part: { toString: {} } },
        to: { zone: "trash" },
      },
    },
    { ...envelope, command: { action: "move", wholePile: false, from: { zone: "hand" }, to: { zone: "invalid" } } },
    { ...envelope, revision: -1, command: { action: "pass" } },
  ])("refuses malformed input without throwing", (value) => {
    expect(parseManualIntent(value)).toBeUndefined();
  });

  it("accepts explicit movement and preserves stable wire values", () => {
    const intent = {
      ...envelope,
      command: {
        action: "move",
        wholePile: false,
        from: { zone: "hand", instanceId: "card" },
        to: { zone: "battleArea" },
      },
    };
    expect(parseManualIntent(intent)).toEqual(intent);
  });
});
