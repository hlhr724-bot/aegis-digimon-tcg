import { ANNOUNCED_TOURNAMENT_STATUSES } from "#api/tournaments/discord/ANNOUNCED_TOURNAMENT_STATUSES";
import { getDiscordRetryAt } from "#api/tournaments/discord/getDiscordRetryAt";
import {
  processTournamentDiscordPost,
  type TournamentDiscordPostRow,
} from "#api/tournaments/discord/processTournamentDiscordPost";
import { syncTournamentDiscordMembers } from "#api/tournaments/discord/syncTournamentDiscordMembers";
import type { TournamentDiscordContext } from "#api/tournaments/discord/TournamentDiscordContext";
import { logError } from "#api/logger";

const TOURNAMENTS_PER_SWEEP = 10;
const LEASE_MS = 120_000;

export async function syncTournamentDiscord(context: TournamentDiscordContext): Promise<number> {
  const { db, now } = context;
  const statuses = ANNOUNCED_TOURNAMENT_STATUSES.map((_, index) => `$${index + 2}`).join(",");
  const candidates = await db.query<TournamentDiscordPostRow & { attempts: number | null }>(
    `SELECT t.id, t.name, t.description, t.format, t.status, t.starts_at, t.max_players, t.best_of,
            p.announcement_message_id, p.thread_id, p.channel_id, p.attempts
     FROM tournaments t LEFT JOIN tournament_discord_posts p ON p.tournament_id = t.id
     WHERE t.discord_announce
       AND ((p.tournament_id IS NULL AND t.status IN (${statuses}))
         OR (p.tournament_id IS NOT NULL AND p.closed_at IS NULL AND p.retry_at <= $1 AND p.lease_until <= $1))
     ORDER BY t.starts_at
     LIMIT ${TOURNAMENTS_PER_SWEEP}`,
    [now, ...ANNOUNCED_TOURNAMENT_STATUSES],
  );
  let actions = 0;
  for (const tournament of candidates.rows) {
    await db.query(
      "INSERT INTO tournament_discord_posts (tournament_id, updated_at) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [tournament.id, now],
    );
    const claimed = await db.query(
      "UPDATE tournament_discord_posts SET lease_until=$2 WHERE tournament_id=$1 AND lease_until<=$3 AND retry_at<=$3 AND closed_at IS NULL",
      [tournament.id, now + LEASE_MS, now],
    );
    if (claimed.rowCount !== 1) {
      continue;
    }
    try {
      const state = (
        await db.query<Pick<TournamentDiscordPostRow, "announcement_message_id" | "thread_id" | "channel_id">>(
          "SELECT announcement_message_id,thread_id,channel_id FROM tournament_discord_posts WHERE tournament_id=$1",
          [tournament.id],
        )
      ).rows[0];
      if (!state) {
        throw new Error("tournament_discord_state_missing");
      }
      actions += await processTournamentDiscordPost(context, { ...tournament, ...state });
      await db.query("UPDATE tournament_discord_posts SET lease_until=0, attempts=0 WHERE tournament_id=$1", [
        tournament.id,
      ]);
    } catch (error) {
      const attempts = Number(tournament.attempts ?? 0) + 1;
      logError(`[tournament-discord] post for ${tournament.id} failed`, error);
      await db.query(
        "UPDATE tournament_discord_posts SET lease_until=0, attempts=$2, retry_at=$3, updated_at=$4 WHERE tournament_id=$1",
        [tournament.id, attempts, getDiscordRetryAt({ error, attempts, now }), now],
      );
    }
  }
  try {
    actions += await syncTournamentDiscordMembers(context);
  } catch (error) {
    logError("[tournament-discord] role sync failed", error);
  }
  return actions;
}
