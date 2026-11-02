import { TournamentSpectatorPolicy } from "#shared/tournaments/TournamentSpectatorPolicy";

export function isTournamentSpectatorPolicy(value: unknown): value is TournamentSpectatorPolicy {
  return typeof value === "string" && Object.values(TournamentSpectatorPolicy).some((policy) => policy.value === value);
}
