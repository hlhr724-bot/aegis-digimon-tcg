import type { AccountStore } from "#api/accounts/AccountStore";
import { logError } from "#api/logger";
import type { BotSeatingStore } from "#api/tournaments/bots/BotSeatingStore";
import { finalizeTournamentCircuits } from "#api/tournaments/circuits/finalizeTournamentCircuits";
import { recordCircuitPoints } from "#api/tournaments/circuits/recordCircuitPoints";
import { scheduleCircuitTournaments } from "#api/tournaments/circuits/scheduleCircuitTournaments";
import { syncCircuitDiscord } from "#api/tournaments/circuits/syncCircuitDiscord";
import { createDiscordRestClient } from "#api/tournaments/discord/createDiscordRestClient";
import type { DiscordRestClient } from "#api/tournaments/discord/DiscordRestClient";
import { getTournamentDiscordConfig } from "#api/tournaments/discord/getTournamentDiscordConfig";
import type { EliminationStore } from "#api/tournaments/elimination/EliminationStore";
import { startDueTournaments } from "#api/tournaments/lifecycle/startDueTournaments";
import type { ParticipantStore } from "#api/tournaments/participants/ParticipantStore";
import type { SwissProgram } from "#api/tournaments/swiss/SwissProgram";

type Params = {
  accounts: AccountStore;
  participants: ParticipantStore;
  bots: BotSeatingStore;
  elimination: EliminationStore;
  swiss: SwissProgram;
  env?: NodeJS.ProcessEnv;
  discord?: DiscordRestClient;
  intervalMs?: number;
};

type CircuitSweep = {
  start: (now: number) => Promise<number>;
  maintain: (now: number) => Promise<number>;
};

export function createTournamentCircuitSweep({
  accounts,
  participants,
  bots,
  elimination,
  swiss,
  env = process.env,
  discord,
  intervalMs = 15_000,
}: Params): CircuitSweep {
  const announce = createAnnouncer({ accounts, env, discord });
  let lastRunAt = Number.NEGATIVE_INFINITY;
  return {
    start: (now) =>
      startDueTournaments({
        accounts,
        participants,
        bots,
        elimination,
        swiss,
        now,
      }),
    maintain: async (now) => {
      if (now - lastRunAt < intervalMs) {
        return 0;
      }
      lastRunAt = now;
      let total = 0;
      for (const [name, pass] of [
        ["schedule", () => scheduleCircuitTournaments({ accounts, now })],
        ["points", () => recordCircuitPoints({ accounts, now })],
        ["finalize", () => finalizeTournamentCircuits({ accounts, now })],
        ["discord", () => announce(now)],
      ] as const) {
        try {
          total += await pass();
        } catch (error) {
          logError(`[tournament-circuits] ${name} pass failed`, error);
        }
      }
      return total;
    },
  };
}

function createAnnouncer({
  accounts,
  env,
  discord,
}: Pick<Params, "accounts" | "discord"> & { env: NodeJS.ProcessEnv }): (now: number) => Promise<number> {
  let config: ReturnType<typeof getTournamentDiscordConfig>;
  try {
    config = getTournamentDiscordConfig(env);
  } catch (error) {
    logError("[tournament-circuits] invalid Discord configuration; circuit announcements disabled", error);
    return async () => 0;
  }
  if (!config) {
    return async () => 0;
  }
  const enabledConfig = config;
  const client = discord ?? createDiscordRestClient({ token: enabledConfig.token });
  return (now) =>
    syncCircuitDiscord({
      accounts,
      config: enabledConfig,
      discord: client,
      now,
    });
}
