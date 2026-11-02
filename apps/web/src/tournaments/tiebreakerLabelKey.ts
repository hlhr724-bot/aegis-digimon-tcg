import type { TournamentTiebreaker } from "@aegis/shared/tournaments/TournamentTiebreaker";
import type { TranslationKey } from "@/i18n/translationTypes";

export function tiebreakerLabelKey(tiebreaker: TournamentTiebreaker): TranslationKey {
  return `tournaments.tiebreaker.${tiebreaker}`;
}
