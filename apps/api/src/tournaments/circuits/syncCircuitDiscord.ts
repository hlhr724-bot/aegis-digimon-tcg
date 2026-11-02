import { TournamentCircuitStatus } from "@aegis/shared/tournaments/circuits/TournamentCircuitStatus";
import type { AccountStore } from "#api/accounts/AccountStore";
import { logError } from "#api/logger";
import { formatCircuitResults } from "#api/tournaments/circuits/formatCircuitResults";
import { TournamentCircuitStore } from "#api/tournaments/circuits/TournamentCircuitStore";
import type { DiscordRestClient } from "#api/tournaments/discord/DiscordRestClient";
import { getDiscordRetryAt } from "#api/tournaments/discord/getDiscordRetryAt";
import type { TournamentDiscordConfig } from "#api/tournaments/discord/TournamentDiscordConfig";

type Params = {
  accounts: AccountStore;
  config: TournamentDiscordConfig;
  discord: DiscordRestClient;
  now: number;
};

const CIRCUITS_PER_SWEEP = 5;
const LEASE_MS = 120_000;

export async function syncCircuitDiscord({ accounts, config, discord, now }: Params): Promise<number> {
  await accounts.ensureReady();
  const db = accounts.pool;
  const store = new TournamentCircuitStore(accounts);
  const candidates = (
    await db.query<{ id: string; name: string; attempts: number | null }>(
      `SELECT c.id, c.name, p.attempts FROM tournament_circuits c
       LEFT JOIN tournament_circuit_discord_posts p ON p.circuit_id = c.id
       WHERE c.status=$2 AND (p.circuit_id IS NULL OR (p.posted_at IS NULL AND p.retry_at<=$1 AND p.lease_until<=$1))
       ORDER BY c.finalized_at LIMIT ${CIRCUITS_PER_SWEEP}`,
      [now, TournamentCircuitStatus.FINISHED.value],
    )
  ).rows;
  let posted = 0;
  for (const circuit of candidates) {
    const circuitId = String(circuit.id);
    await db.query(
      "INSERT INTO tournament_circuit_discord_posts (circuit_id, updated_at) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [circuitId, now],
    );
    const claimed = await db.query(
      "UPDATE tournament_circuit_discord_posts SET lease_until=$2 WHERE circuit_id=$1 AND posted_at IS NULL AND lease_until<=$3 AND retry_at<=$3",
      [circuitId, now + LEASE_MS, now],
    );
    if (claimed.rowCount !== 1) {
      continue;
    }
    try {
      const messages = formatCircuitResults({
        name: circuit.name,
        link: `${config.webUrl}/tournaments/circuits/${circuitId}`,
        standings: await store.standings(circuitId),
      });
      let messageId: string | null = null;
      for (const message of messages) {
        const sent = await discord.postMessage(config.channelId, message);
        messageId ??= sent.id;
      }
      await db.query(
        "UPDATE tournament_circuit_discord_posts SET message_id=$2, posted_at=$3, lease_until=0, updated_at=$3 WHERE circuit_id=$1",
        [circuitId, messageId, now],
      );
      posted += 1;
    } catch (error) {
      const attempts = Number(circuit.attempts ?? 0) + 1;
      logError(`[tournament-circuits] Discord post for ${circuitId} failed`, error);
      await db.query(
        "UPDATE tournament_circuit_discord_posts SET lease_until=0, attempts=$2, retry_at=$3, updated_at=$4 WHERE circuit_id=$1",
        [circuitId, attempts, getDiscordRetryAt({ error, attempts, now }), now],
      );
    }
  }
  return posted;
}
