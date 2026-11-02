import type { AccountStore } from "#api/accounts/AccountStore";
import type { TournamentSpectator } from "@aegis/shared/tournaments/TournamentSpectator";
import type { TournamentSpectatorPolicy } from "@aegis/shared/tournaments/TournamentSpectatorPolicy";

export const TOURNAMENT_SPECTATOR_LIMIT = 50;

type PolicyParams = { tournamentId: string; policy: TournamentSpectatorPolicy };
type MembershipParams = { tournamentId: string; accountId: string };
type AddParams = { tournamentId: string; displayName: string; now: number };
type AddOutcome =
  | { kind: "added"; spectator: TournamentSpectator }
  | { kind: "account_not_found" }
  | { kind: "limit_reached" };
type SpectatorRow = { account_id: string; display_name: string; added_at: string | number };

export class TournamentSpectatorStore {
  constructor(private readonly accounts: AccountStore) {}

  async setPolicy({ tournamentId, policy }: PolicyParams): Promise<boolean> {
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query("UPDATE tournaments SET spectator_policy=$2 WHERE id=$1", [
      tournamentId,
      policy,
    ]);
    return result.rowCount === 1;
  }

  async list(tournamentId: string): Promise<TournamentSpectator[]> {
    await this.accounts.ensureReady();
    const rows = await this.accounts.pool.query<SpectatorRow>(
      `SELECT s.account_id,a.display_name,s.added_at FROM tournament_spectators s
       JOIN accounts a ON a.id=s.account_id WHERE s.tournament_id=$1 ORDER BY s.added_at,a.display_name`,
      [tournamentId],
    );
    return rows.rows.map(toSpectator);
  }

  async add({ tournamentId, displayName, now }: AddParams): Promise<AddOutcome> {
    await this.accounts.ensureReady();
    const client = this.accounts.pool;
    const account = (
      await client.query<{ id: string; display_name: string }>(
        "SELECT id,display_name FROM accounts WHERE lower(display_name)=lower($1)",
        [displayName.trim()],
      )
    ).rows[0];
    if (!account) {
      return { kind: "account_not_found" };
    }
    const count = (
      await client.query<{ count: string }>(
        "SELECT COUNT(*) count FROM tournament_spectators WHERE tournament_id=$1 AND account_id<>$2",
        [tournamentId, account.id],
      )
    ).rows[0]?.count;
    if (Number(count) >= TOURNAMENT_SPECTATOR_LIMIT) {
      return { kind: "limit_reached" };
    }
    const inserted = await client.query<SpectatorRow>(
      `INSERT INTO tournament_spectators (tournament_id,account_id,added_at) VALUES ($1,$2,$3)
         ON CONFLICT (tournament_id,account_id) DO UPDATE SET added_at=tournament_spectators.added_at
         RETURNING account_id,added_at`,
      [tournamentId, account.id, now],
    );
    const row = inserted.rows[0]!;
    return { kind: "added", spectator: toSpectator({ ...row, display_name: account.display_name }) };
  }

  async remove({ tournamentId, accountId }: MembershipParams): Promise<boolean> {
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query(
      "DELETE FROM tournament_spectators WHERE tournament_id=$1 AND account_id=$2",
      [tournamentId, accountId],
    );
    return result.rowCount === 1;
  }

  async isListed({ tournamentId, accountId }: MembershipParams): Promise<boolean> {
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query(
      "SELECT 1 FROM tournament_spectators WHERE tournament_id=$1 AND account_id=$2",
      [tournamentId, accountId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async isActiveParticipant({ tournamentId, accountId }: MembershipParams): Promise<boolean> {
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query(
      `SELECT 1 FROM tournament_participants WHERE tournament_id=$1 AND account_id=$2
       AND status IN ('registered','checked_in','active')`,
      [tournamentId, accountId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

function toSpectator(row: SpectatorRow): TournamentSpectator {
  return { accountId: row.account_id, displayName: row.display_name, addedAt: Number(row.added_at) };
}
