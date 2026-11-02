import type { PoolClient } from "pg";
import type { TournamentResultExport } from "@aegis/shared/tournaments/TournamentResultExport";
import type { AccountStore } from "#api/accounts/AccountStore";
import { logError } from "#api/logger";
import { buildTournamentResultExport } from "#api/tournaments/results/buildTournamentResultExport";
import { saveTournamentResultExport } from "#api/tournaments/results/saveTournamentResultExport";

const TOURNAMENTS_PER_SWEEP = 20;

type SweepParams = {
  standings: (tournamentId: string) => Promise<readonly { participantId: string }[]>;
  now: number;
};
type ExportLookup =
  | { kind: "not_found" }
  | { kind: "found"; organizerId: string; payload: TournamentResultExport | null };

export class TournamentResultStore {
  constructor(private readonly accounts: AccountStore) {}

  async findExport(tournamentId: string): Promise<ExportLookup> {
    await this.accounts.ensureReady();
    const row = (
      await this.accounts.pool.query<{ created_by: string; payload: TournamentResultExport | string | null }>(
        `SELECT t.created_by, e.payload FROM tournaments t
         LEFT JOIN tournament_result_exports e ON e.tournament_id = t.id
         WHERE t.id=$1`,
        [tournamentId],
      )
    ).rows[0];
    if (!row) {
      return { kind: "not_found" };
    }
    const payload = typeof row.payload === "string" ? (JSON.parse(row.payload) as TournamentResultExport) : row.payload;
    return { kind: "found", organizerId: String(row.created_by), payload };
  }

  async sweepFinishedTournaments({ standings, now }: SweepParams): Promise<number> {
    await this.accounts.ensureReady();
    const candidates = (
      await this.accounts.pool.query<{ id: string }>(
        `SELECT t.id FROM tournaments t
         LEFT JOIN tournament_result_exports e ON e.tournament_id = t.id
         WHERE t.status='finished' AND e.tournament_id IS NULL
         ORDER BY t.id LIMIT ${TOURNAMENTS_PER_SWEEP}`,
      )
    ).rows;
    let written = 0;
    for (const candidate of candidates) {
      const tournamentId = String(candidate.id);
      try {
        written += await this.runTransaction(async (db) => {
          const results = await buildTournamentResultExport({ db, tournamentId, standings, now });
          if (!results) {
            return 0;
          }
          return saveTournamentResultExport({ db, results });
        });
      } catch (error) {
        logError(`[tournaments] results for tournament ${tournamentId} failed`, error);
      }
    }
    return written;
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
