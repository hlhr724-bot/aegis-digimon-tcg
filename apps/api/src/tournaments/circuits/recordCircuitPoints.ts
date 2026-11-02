import type { TournamentCircuitPointsTier } from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import type { TournamentResultExport } from "@aegis/shared/tournaments/TournamentResultExport";
import type { AccountStore } from "#api/accounts/AccountStore";
import { logError } from "#api/logger";
import { runCircuitTransaction } from "#api/tournaments/circuits/runCircuitTransaction";
import { scoreCircuitPlacement } from "#api/tournaments/circuits/scoreCircuitPlacement";

type Params = { accounts: AccountStore; now: number };
type CandidateRow = {
  tournament_id: string;
  circuit_id: string;
  payload: TournamentResultExport | string;
  points_table: TournamentCircuitPointsTier[] | string;
  participation_points: number;
};

const TOURNAMENTS_PER_SWEEP = 20;

export async function recordCircuitPoints({ accounts, now }: Params): Promise<number> {
  await accounts.ensureReady();
  const candidates = (
    await accounts.pool.query<CandidateRow>(
      `SELECT t.id AS tournament_id, t.circuit_id, e.payload, c.points_table, c.participation_points
       FROM tournaments t
       JOIN tournament_circuits c ON c.id = t.circuit_id
       JOIN tournament_result_exports e ON e.tournament_id = t.id
       LEFT JOIN tournament_circuit_scores s ON s.tournament_id = t.id
       WHERE s.tournament_id IS NULL
       ORDER BY t.starts_at, t.id LIMIT ${TOURNAMENTS_PER_SWEEP}`,
    )
  ).rows;
  let recorded = 0;
  for (const candidate of candidates) {
    try {
      recorded += await runCircuitTransaction({
        accounts,
        work: async (db) => {
          const claimed = await db.query(
            "INSERT INTO tournament_circuit_scores (tournament_id, circuit_id, scored_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
            [candidate.tournament_id, candidate.circuit_id, now],
          );
          if (claimed.rowCount !== 1) {
            return 0;
          }
          const results = parseJson(candidate.payload);
          const pointsTable = parseJson(candidate.points_table);
          let written = 0;
          for (const participant of results.participants) {
            if (!participant.accountId || participant.kind !== "human" || participant.disqualified) {
              continue;
            }
            if (participant.wins + participant.losses + participant.draws + participant.byes === 0) {
              continue;
            }
            const points = scoreCircuitPlacement({
              placement: participant.placement,
              pointsTable,
              participationPoints: Number(candidate.participation_points),
            });
            await db.query(
              `INSERT INTO tournament_circuit_points (tournament_id, account_id, circuit_id, placement, points)
               VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
              [candidate.tournament_id, participant.accountId, candidate.circuit_id, participant.placement, points],
            );
            written += 1;
          }
          return written;
        },
      });
    } catch (error) {
      logError(`[tournament-circuits] points for tournament ${candidate.tournament_id} failed`, error);
    }
  }
  return recorded;
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}
