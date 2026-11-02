import type { DiscordPlayer } from "#api/tournaments/discord/DiscordPlayer";

export type TournamentRoundPairing = { table: number; players: readonly DiscordPlayer[] };
