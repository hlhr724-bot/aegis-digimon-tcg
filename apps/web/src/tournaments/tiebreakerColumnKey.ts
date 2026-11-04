import type { TournamentTiebreaker } from "@aegis/shared/tournaments/TournamentTiebreaker";
import type { TranslationKey } from "@/i18n/translationTypes";

export function tiebreakerColumnKey(tiebreaker: TournamentTiebreaker): TranslationKey {
  return `tournaments.tiebreakerColumn.${tiebreaker}`;
}
