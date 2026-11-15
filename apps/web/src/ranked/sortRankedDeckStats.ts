import type { RankedDeckStats } from "@aegis/shared/ranked/RankedDeckStats";
import type { RankedDeckSort } from "@/ranked/RankedDeckSort";

type Params = { rows: readonly RankedDeckStats[]; sort: RankedDeckSort; locale: string };

export function sortRankedDeckStats({ rows, sort, locale }: Params): RankedDeckStats[] {
  const direction = sort.descending ? -1 : 1;
  return [...rows].sort((left, right) => {
    if (sort.column === "archetype") {
      return direction * left.archetype.localeCompare(right.archetype, locale, { sensitivity: "base" });
    }
    const leftValue = left[sort.column];
    const rightValue = right[sort.column];
    if (leftValue === null || rightValue === null) {
      return Number(leftValue === null) - Number(rightValue === null) || right.games - left.games;
    }
    return direction * (leftValue - rightValue) || right.games - left.games;
  });
}
