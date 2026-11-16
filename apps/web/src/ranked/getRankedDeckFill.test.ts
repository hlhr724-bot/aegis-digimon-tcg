import { expect, it } from "vitest";
import { COLORS } from "@/design/theme";
import { getRankedDeckFill } from "@/ranked/getRankedDeckFill";

it("paints a deck with its card colours", () => {
  expect(getRankedDeckFill({ colors: ["Green"] })).toBe(COLORS.Green.base);
  expect(getRankedDeckFill({ colors: ["Green", "Blue"] })).toBe(
    `linear-gradient(90deg, ${COLORS.Green.base}, ${COLORS.Blue.base})`,
  );
});

it("uses the neutral colour for a deck without known colours", () => {
  expect(getRankedDeckFill({ colors: [] })).toBe(COLORS.Neutral.base);
  expect(getRankedDeckFill({ colors: ["Teal"] })).toBe(COLORS.Neutral.base);
});
