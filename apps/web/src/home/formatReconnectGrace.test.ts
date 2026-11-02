import { describe, expect, it } from "vitest";
import { formatReconnectGrace } from "@/home/formatReconnectGrace";

describe("reconnect grace label", () => {
  it.each([
    [60_000, "1:00"],
    [42_000, "0:42"],
    [41_001, "0:42"],
    [900, "0:01"],
    [0, "0:00"],
    [-500, "0:00"],
  ])("shows %i ms as %s", (remainingMs, label) => {
    expect(formatReconnectGrace(remainingMs)).toBe(label);
  });
});
