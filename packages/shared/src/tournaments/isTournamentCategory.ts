import { TournamentCategory } from "#shared/tournaments/TournamentCategory";

export function isTournamentCategory(value: unknown): value is TournamentCategory {
  return typeof value === "string" && Object.values(TournamentCategory).some((category) => category.value === value);
}
