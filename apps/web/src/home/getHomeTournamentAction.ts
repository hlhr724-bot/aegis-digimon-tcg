import type { TranslationKey } from "@/i18n/translationTypes";
import type { TournamentListing } from "@/tournaments/types";

type HomeTournamentActionParams = {
  tournament: TournamentListing;
  now: number;
};

export type HomeTournamentAction = {
  labelKey: TranslationKey;
  primary: boolean;
};

const OPEN_STATUSES: readonly string[] = ["registration", "check_in"];

export function getHomeTournamentAction({ tournament, now }: HomeTournamentActionParams): HomeTournamentAction {
  const entry = tournament.myEntry;
  if (entry) {
    const opensAt = entry.checkInOpensAt;
    const closesAt = entry.checkInClosesAt;
    const checkInOpen = opensAt !== null && closesAt !== null && now >= opensAt && now < closesAt;
    if (entry.status === "registered" && checkInOpen) {
      return { labelKey: "tournaments.detail.checkIn", primary: true };
    }
    return { labelKey: "tournaments.catalog.view", primary: false };
  }
  const open = OPEN_STATUSES.includes(tournament.status);
  if (open && tournament.registeredCount >= tournament.maxPlayers) {
    return { labelKey: "tournaments.catalog.full", primary: false };
  }
  if (tournament.status === "registration") {
    return { labelKey: "home.tournaments.signUp", primary: true };
  }
  return { labelKey: "tournaments.catalog.view", primary: false };
}
