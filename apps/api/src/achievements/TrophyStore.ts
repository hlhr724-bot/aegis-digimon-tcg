import type { PoolClient } from "pg";
import { TrophyAward } from "@aegis/shared/achievements/TrophyAward";
import { TrophySourceKind } from "@aegis/shared/achievements/TrophySourceKind";
import { TrophyTier } from "@aegis/shared/achievements/TrophyTier";
import type { Trophy, TrophyCabinet } from "@aegis/shared/achievements/TrophyContracts";
import type { AccountStore } from "#api/accounts/AccountStore";
import { grantTournamentTrophies } from "#api/achievements/grantTournamentTrophies";
import type { TournamentDiscordContext } from "#api/tournaments/discord/TournamentDiscordContext";
import { logError } from "#api/logger";

const TOURNAMENTS_PER_SWEEP = 20;

type SweepParams = { standings: TournamentDiscordContext["standings"]; now: number };
type TrophyRow = {
  source_kind: string;
  source_key: string;
  award: string;
  tier: string;
  tournament_id: string | null;
  tournament_name: string | null;
  circuit_id: string | null;
  circuit_name: string | null;
  awarded_at: string | number;
};

export class TrophyStore {
  constructor(private readonly accounts: AccountStore) {}

  async getTrophies(accountId: string): Promise<TrophyCabinet> {
    await this.accounts.ensureReady();
    const rows = (
      await this.accounts.pool.query<TrophyRow>(
        `SELECT p.source_kind, p.source_key, p.award, p.tier, p.tournament_id, t.name AS tournament_name,
                p.circuit_id, c.name AS circuit_name, p.awarded_at
         FROM player_trophies p
         LEFT JOIN tournaments t ON t.id = p.tournament_id
         LEFT JOIN tournament_circuits c ON c.id = p.circuit_id
         WHERE p.account_id=$1 AND p.source_kind IN ($2,$3)
         ORDER BY p.awarded_at DESC, p.source_key`,
        [accountId, TrophySourceKind.TOURNAMENT.value, TrophySourceKind.TOURNAMENT_CIRCUIT.value],
      )
    ).rows;
    return { items: rows.flatMap((row) => buildTrophy(row) ?? []) };
  }

  async sweepTournamentTrophies({ standings, now }: SweepParams): Promise<number> {
    await this.accounts.ensureReady();
    const candidates = (
      await this.accounts.pool.query<{ id: string }>(
        `SELECT t.id FROM tournaments t LEFT JOIN tournament_trophy_grants g ON g.tournament_id = t.id
         WHERE t.status='finished' AND g.tournament_id IS NULL
         ORDER BY t.id LIMIT ${TOURNAMENTS_PER_SWEEP}`,
      )
    ).rows;
    let granted = 0;
    for (const candidate of candidates) {
      const tournamentId = String(candidate.id);
      try {
        granted += await this.runTransaction((db) => grantTournamentTrophies({ db, tournamentId, standings, now }));
      } catch (error) {
        logError(`[achievements] trophies for tournament ${tournamentId} failed`, error);
      }
    }
    return granted;
  }

  private async runTransaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.accounts.pool.connect();
    try {
      await db.query("BEGIN");
      const result = await work(db);
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
}

function buildTrophy(row: TrophyRow): Trophy | null {
  const award = Object.values(TrophyAward).find((entry) => entry.value === row.award);
  const tier = Object.values(TrophyTier).find((entry) => entry.value === row.tier);
  if (!award || !tier) {
    return null;
  }
  const awardedAt = Number(row.awarded_at);
  if (row.source_kind === TrophySourceKind.TOURNAMENT.value && row.tournament_id) {
    return {
      award: award.value,
      tier: tier.value,
      source: {
        kind: TrophySourceKind.TOURNAMENT.value,
        tournamentId: String(row.tournament_id),
        name: row.tournament_name ?? "",
      },
      awardedAt,
    };
  }
  if (row.source_kind === TrophySourceKind.TOURNAMENT_CIRCUIT.value && row.circuit_id) {
    return {
      award: award.value,
      tier: tier.value,
      source: {
        kind: TrophySourceKind.TOURNAMENT_CIRCUIT.value,
        circuitId: String(row.circuit_id),
        name: row.circuit_name ?? "",
      },
      awardedAt,
    };
  }
  return null;
}
