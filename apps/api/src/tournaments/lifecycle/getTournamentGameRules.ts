import type { AccountStore, Tournament } from "#api/accounts/AccountStore";

type Params = { accounts: AccountStore; gameId: string };

export async function getTournamentGameRules({ accounts, gameId }: Params): Promise<Tournament | undefined> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId)) {
    return undefined;
  }
  await accounts.ensureReady();
  const row = (
    await accounts.pool.query<{ tournament_id: string }>(
      "SELECT m.tournament_id FROM tournament_games g JOIN match_series s ON s.id=g.series_id JOIN tournament_matches m ON m.id=s.tournament_match_id WHERE g.id=$1",
      [gameId],
    )
  ).rows[0];
  return row ? accounts.tournament(row.tournament_id) : undefined;
}
