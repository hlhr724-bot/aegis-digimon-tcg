import type { TournamentTiebreaker } from "@aegis/shared/tournaments/TournamentTiebreaker";
import type { TranslationKey } from "@/i18n/translationTypes";

export function tiebreakerHelpKey(tiebreaker: TournamentTiebreaker): TranslationKey {
  return `tournaments.tiebreakerHelp.${tiebreaker}`;
}
