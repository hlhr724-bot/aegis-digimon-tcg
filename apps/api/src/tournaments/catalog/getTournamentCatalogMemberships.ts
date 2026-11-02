import type { AccountStore } from "#api/accounts/AccountStore";
import type { TournamentSummary } from "@aegis/shared/tournaments/index";

type Params = { accounts: AccountStore; accountId: string };
type Entry = NonNullable<TournamentSummary["myEntry"]>;
type Row = {
  tournament_id: string;
  status: Entry["status"];
  check_in_opens_at: string | null;
  check_in_closes_at: string | null;
};

export async function getTournamentCatalogMemberships({ accounts, accountId }: Params): Promise<Map<string, Entry>> {
  await accounts.ensureReady();
  const result = await accounts.pool.query<Row>(
    `SELECT p.tournament_id,p.status,t.check_in_opens_at,t.check_in_closes_at
      FROM tournament_participants p JOIN tournaments t ON t.id=p.tournament_id
      WHERE p.account_id=$1`,
    [accountId],
  );
  return new Map(
    result.rows.map((row) => [
      row.tournament_id,
      {
        status: row.status,
        checkInOpensAt: row.check_in_opens_at === null ? null : Number(row.check_in_opens_at),
        checkInClosesAt: row.check_in_closes_at === null ? null : Number(row.check_in_closes_at),
      },
    ]),
  );
}
