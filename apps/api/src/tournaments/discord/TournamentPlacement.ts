import type { DiscordPlayer } from "#api/tournaments/discord/DiscordPlayer";
import type { TournamentDiscordRole } from "#api/tournaments/discord/TournamentDiscordRole";

export type TournamentPlacement = {
  accountId: string | null;
  role: Exclude<TournamentDiscordRole, "participant">;
  player: DiscordPlayer;
};
