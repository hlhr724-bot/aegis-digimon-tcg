import type { Queryable } from "#api/db/migrator";
import type { DiscordPlayer } from "#api/tournaments/discord/DiscordPlayer";
import { readDiscordUserIds } from "#api/tournaments/discord/readDiscordUserIds";

export type TournamentRosterEntry = DiscordPlayer & { accountId: string | null };

export async function readTournamentRoster(
  db: Queryable,
  tournamentId: string,
): Promise<Map<string, TournamentRosterEntry>> {
  const participants = await db.query<{ id: string; account_id: string | null; display_name: string }>(
    "SELECT id, account_id, display_name FROM tournament_participants WHERE tournament_id=$1",
    [tournamentId],
  );
  const discordIds = await readDiscordUserIds(
    db,
    participants.rows.flatMap((row) => (row.account_id ? [String(row.account_id)] : [])),
  );
  return new Map(
    participants.rows.map((row) => {
      const accountId = row.account_id ? String(row.account_id) : null;
      const discordUserId = accountId ? discordIds.get(accountId) : undefined;
      return [String(row.id), { accountId, name: row.display_name, ...(discordUserId ? { discordUserId } : {}) }];
    }),
  );
}
