import { COLORS, colorKey } from "@/design/theme";

type Params = { colors: readonly string[] };

export function getRankedDeckFill({ colors }: Params): string {
  const [first, second] = colors.map((color) => COLORS[colorKey(color)].base);
  if (!first) {
    return COLORS.Neutral.base;
  }
  return second ? `linear-gradient(90deg, ${first}, ${second})` : first;
}
