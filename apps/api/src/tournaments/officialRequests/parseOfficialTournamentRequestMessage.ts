import { OFFICIAL_TOURNAMENT_REQUEST_MESSAGE_MAX } from "@aegis/shared/tournaments/OfficialTournamentRequest";

export function parseOfficialTournamentRequestMessage(body: unknown): { message: string | null } | undefined {
  const message: unknown =
    typeof body === "object" && body !== null ? (body as { message?: unknown }).message : undefined;
  if (message === undefined || message === null) {
    return { message: null };
  }
  if (typeof message !== "string") {
    return undefined;
  }
  const trimmed = message.trim();
  if (trimmed.length > OFFICIAL_TOURNAMENT_REQUEST_MESSAGE_MAX) {
    return undefined;
  }
  return { message: trimmed || null };
}
