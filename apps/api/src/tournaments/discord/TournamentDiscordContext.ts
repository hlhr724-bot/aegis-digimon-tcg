import type { Queryable } from "#api/db/migrator";
import type { DiscordRestClient } from "#api/tournaments/discord/DiscordRestClient";
import type { TournamentDiscordConfig } from "#api/tournaments/discord/TournamentDiscordConfig";

export type TournamentDiscordContext = {
  db: Queryable;
  config: TournamentDiscordConfig;
  discord: DiscordRestClient;
  standings: (tournamentId: string) => Promise<readonly { participantId: string }[]>;
  now: number;
};
