import { expect, it } from "vitest";
import { formatDp } from "@/design/formatDp";

it.each([
  [0, "0K"],
  [1000, "1K"],
  [12000, "12K"],
])("abbreviates round DP %s", (amount, expected) => {
  expect(formatDp(Number(amount))).toBe(expected);
});

it("keeps locale separators for non-round DP", () => {
  expect(formatDp(12500)).toBe((12500).toLocaleString());
});
