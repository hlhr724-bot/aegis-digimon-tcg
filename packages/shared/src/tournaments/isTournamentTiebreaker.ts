import { TournamentTiebreaker } from "#shared/tournaments/TournamentTiebreaker";

export function isTournamentTiebreaker(value: unknown): value is TournamentTiebreaker {
  return typeof value === "string" && Object.values(TournamentTiebreaker).some((entry) => entry.value === value);
}
