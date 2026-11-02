import type { RegistrationStatus } from "@aegis/shared/tournaments/index";
import type { EntryActions } from "@/tournaments/entry";
import { TournamentEntryView, type TournamentEntryViewEntry } from "@/tournaments/TournamentEntryView";
import type { TournamentDetail } from "@/tournaments/types";

type GetTournamentEntryViewParams = {
  signedIn: boolean;
  signingUp: boolean;
  actions: EntryActions;
  checkInOpen: boolean;
  tournamentStatus: TournamentDetail["status"];
  entryStatus: RegistrationStatus | undefined;
};

export function getTournamentEntryView({
  signedIn,
  signingUp,
  actions,
  checkInOpen,
  tournamentStatus,
  entryStatus,
}: GetTournamentEntryViewParams): TournamentEntryViewEntry {
  if (!signedIn) {
    return TournamentEntryView.SIGNED_OUT;
  }
  if (actions.register) {
    return signingUp ? TournamentEntryView.SIGNUP : TournamentEntryView.OPEN;
  }
  if (actions.checkIn && checkInOpen) {
    return TournamentEntryView.CHECK_IN;
  }
  const beforeStart = tournamentStatus === "registration" || tournamentStatus === "check_in";
  if (beforeStart && entryStatus === "registered") {
    return TournamentEntryView.REGISTERED;
  }
  if (beforeStart && entryStatus === "checked_in") {
    return TournamentEntryView.CHECKED_IN;
  }
  return TournamentEntryView.SUMMARY;
}
