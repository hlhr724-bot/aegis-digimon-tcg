import type { TournamentResultExport } from "@aegis/shared/tournaments/TournamentResultExport";
import type { Queryable } from "#api/db/migrator";

type Params = { db: Queryable; results: TournamentResultExport };

export async function saveTournamentResultExport({ db, results }: Params): Promise<number> {
  const inserted = await db.query(
    "INSERT INTO tournament_result_exports (tournament_id, schema_version, payload, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
    [results.event.id, results.schemaVersion, JSON.stringify(results), results.exportedAt],
  );
  return inserted.rowCount ?? 0;
}
