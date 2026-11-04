import type { TournamentRules } from "@aegis/shared";
import { isTournamentTiebreaker } from "@aegis/shared/tournaments/isTournamentTiebreaker";
import type { TournamentTiebreaker } from "@aegis/shared/tournaments/TournamentTiebreaker";

export function eventTiebreakers(rules: TournamentRules | null | undefined): TournamentTiebreaker[] {
  return (rules?.standings.tiebreakers ?? []).filter(isTournamentTiebreaker);
}
