import type { TournamentListing } from "@/tournaments/types";

export function isTournamentClosed(tournament: Pick<TournamentListing, "status">): boolean {
  return tournament.status === "finished" || tournament.status === "cancelled";
}
