import type { ParticipantView, RegistrationStatus, TournamentStatus } from "@aegis/shared";
import type { TournamentDetail } from "./types";

const OCCUPYING: readonly RegistrationStatus[] = ["registered", "checked_in", "active"];

const REGISTRATION_OPEN: readonly TournamentStatus[] = ["registration"];

const CHECK_IN_OPEN: readonly TournamentStatus[] = ["registration", "check_in"];

export type EntryActions = { register: boolean; checkIn: boolean; drop: boolean };

type EntryActionsParams = {
  detail: TournamentDetail;
  own: ParticipantView | undefined;
  signedIn: boolean;
};

export function entryActions({ detail, own, signedIn }: EntryActionsParams): EntryActions {
  const status = own?.status ?? detail.myEntry?.status;
  const registrationUnknown = status === undefined && (!signedIn || Boolean(detail.ownDeck));
  const holdsSeat = status !== undefined && OCCUPYING.includes(status);
  const full = detail.registeredCount >= detail.maxPlayers;

  return {
    register: REGISTRATION_OPEN.includes(detail.status) && !full && !holdsSeat && status !== "disqualified",
    checkIn: CHECK_IN_OPEN.includes(detail.status) && (registrationUnknown || status === "registered"),
    drop: detail.status !== "finished" && detail.status !== "cancelled" && holdsSeat,
  };
}
