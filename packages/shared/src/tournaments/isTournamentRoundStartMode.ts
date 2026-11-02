import { TournamentRoundStartMode } from "#shared/tournaments/TournamentRoundStartMode";

export function isTournamentRoundStartMode(value: unknown): value is TournamentRoundStartMode {
  return typeof value === "string" && Object.values(TournamentRoundStartMode).some((mode) => mode.value === value);
}
