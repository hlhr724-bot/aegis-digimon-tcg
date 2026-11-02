import { TrophyAward } from "@aegis/shared/achievements/TrophyAward";
import { TrophySourceKind } from "@aegis/shared/achievements/TrophySourceKind";
import type { TournamentCircuitStanding } from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import { TournamentCircuitStatus } from "@aegis/shared/tournaments/circuits/TournamentCircuitStatus";
import type { AccountStore } from "#api/accounts/AccountStore";
import { logError } from "#api/logger";
import { runCircuitTransaction } from "#api/tournaments/circuits/runCircuitTransaction";
import { TournamentCircuitStore } from "#api/tournaments/circuits/TournamentCircuitStore";

type Params = { accounts: AccountStore; now: number };

const CIRCUIT_AWARDS = Object.values(TrophyAward)
  .filter((award) => award.sourceKind === TrophySourceKind.TOURNAMENT_CIRCUIT.value)
  .flatMap((award) => ("maxPosition" in award ? [award] : []))
  .sort((left, right) => left.maxPosition - right.maxPosition);

export async function finalizeTournamentCircuits({ accounts, now }: Params): Promise<number> {
  await accounts.ensureReady();
  const store = new TournamentCircuitStore(accounts);
  const due = (
    await accounts.pool.query<{ id: string }>(
      "SELECT id FROM tournament_circuits WHERE status=$1 AND ends_at<=$2 ORDER BY ends_at, id",
      [TournamentCircuitStatus.ACTIVE.value, now],
    )
  ).rows;
  let finalized = 0;
  for (const { id } of due) {
    const circuitId = String(id);
    try {
      if (await hasPendingEvents(accounts, circuitId)) {
        continue;
      }
      const standings = await store.liveStandings(circuitId);
      finalized += await runCircuitTransaction({
        accounts,
        work: async (db) => {
          const updated = await db.query(
            "UPDATE tournament_circuits SET status=$2, finalized_at=$3 WHERE id=$1 AND status=$4",
            [circuitId, TournamentCircuitStatus.FINISHED.value, now, TournamentCircuitStatus.ACTIVE.value],
          );
          if (updated.rowCount !== 1) {
            return 0;
          }
          await db.query(
            "INSERT INTO tournament_circuit_results (circuit_id, standings, frozen_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
            [circuitId, JSON.stringify(standings), now],
          );
          for (const standing of standings) {
            const award = getCircuitAward(standing);
            if (!award) {
              continue;
            }
            await db.query(
              `INSERT INTO player_trophies (account_id, source_kind, source_key, award, tier, circuit_id, awarded_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
              [standing.accountId, award.sourceKind, circuitId, award.value, award.tier, circuitId, now],
            );
          }
          return 1;
        },
      });
    } catch (error) {
      logError(`[tournament-circuits] finalizing ${circuitId} failed`, error);
    }
  }
  return finalized;
}

async function hasPendingEvents(accounts: AccountStore, circuitId: string): Promise<boolean> {
  const pending = await accounts.pool.query(
    `SELECT 1 FROM tournaments t LEFT JOIN tournament_circuit_scores s ON s.tournament_id = t.id
     WHERE t.circuit_id=$1 AND (t.status NOT IN ('finished','cancelled') OR (t.status='finished' AND s.tournament_id IS NULL))
     LIMIT 1`,
    [circuitId],
  );
  return (pending.rowCount ?? 0) > 0;
}

function getCircuitAward(standing: TournamentCircuitStanding) {
  if (standing.points === 0) {
    return undefined;
  }
  return CIRCUIT_AWARDS.find((award) => standing.position <= award.maxPosition);
}
