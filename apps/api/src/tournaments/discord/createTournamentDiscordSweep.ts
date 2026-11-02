import type { AccountStore } from "#api/accounts/AccountStore";
import { createDiscordRestClient } from "#api/tournaments/discord/createDiscordRestClient";
import type { DiscordRestClient } from "#api/tournaments/discord/DiscordRestClient";
import { getTournamentDiscordConfig } from "#api/tournaments/discord/getTournamentDiscordConfig";
import { syncTournamentDiscord } from "#api/tournaments/discord/syncTournamentDiscord";
import { logError } from "#api/logger";
import type { TournamentDiscordContext } from "#api/tournaments/discord/TournamentDiscordContext";

type Params = {
  accounts: AccountStore;
  standings: TournamentDiscordContext["standings"];
  env?: NodeJS.ProcessEnv;
  discord?: DiscordRestClient;
  intervalMs?: number;
};

export function createTournamentDiscordSweep({
  accounts,
  standings,
  env = process.env,
  discord,
  intervalMs = 15_000,
}: Params): (now: number) => Promise<number> {
  let config: ReturnType<typeof getTournamentDiscordConfig>;
  try {
    config = getTournamentDiscordConfig(env);
  } catch (error) {
    logError("[tournament-discord] invalid configuration; Discord sync disabled", error);
    return async () => 0;
  }
  if (!config) {
    return async () => 0;
  }
  const enabledConfig = config;
  const client = discord ?? createDiscordRestClient({ token: enabledConfig.token });
  let lastRunAt = Number.NEGATIVE_INFINITY;
  return async (now) => {
    if (now - lastRunAt < intervalMs) {
      return 0;
    }
    lastRunAt = now;
    await accounts.ensureReady();
    return syncTournamentDiscord({ db: accounts.pool, config: enabledConfig, discord: client, standings, now });
  };
}
