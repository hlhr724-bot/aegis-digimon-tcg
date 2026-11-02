import type { TournamentGameTicket } from "#shared/tournaments/TournamentGameTicket";

export function isTournamentGameTicket(value: unknown): value is TournamentGameTicket {
  if (!value || typeof value !== "object") {
    return false;
  }
  const ticket = value as Record<string, unknown>;
  return (
    ["tournamentId", "matchId", "seriesId", "gameId", "token"].every(
      (key) => typeof ticket[key] === "string" && ticket[key].length > 0,
    ) &&
    typeof ticket.expiresAt === "number" &&
    Number.isFinite(ticket.expiresAt)
  );
}
