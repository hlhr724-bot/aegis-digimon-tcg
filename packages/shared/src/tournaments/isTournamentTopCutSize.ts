import { TOURNAMENT_TOP_CUT_SIZES, type TournamentTopCutSize } from "#shared/tournaments/TournamentTopCutSize";

export function isTournamentTopCutSize(value: unknown): value is TournamentTopCutSize {
  return typeof value === "number" && TOURNAMENT_TOP_CUT_SIZES.some((size) => size === value);
}
