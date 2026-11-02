import type { Queryable } from "#api/db/migrator";

export async function advanceSeriesDeadline({
  db,
  seriesId,
  dueAt,
}: {
  db: Queryable;
  seriesId: string;
  dueAt: number;
}): Promise<void> {
  await db.query(
    `UPDATE tournament_deadlines SET due_at=$1
      WHERE kind='series_deadline' AND subject_id=$2 AND executed_at IS NULL AND due_at>$1`,
    [dueAt, seriesId],
  );
}
