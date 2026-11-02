import type { PoolClient } from "pg";
import { calculateElo } from "#api/ranked/calculateElo";
import { RankedQueueStatus } from "@aegis/shared/ranked/RankedQueueStatus";

type Params = {
  db: PoolClient;
  pairId: string;
  roomId: string;
  matchId: string;
  matchLogId?: string;
  winnerAccountId: string | null;
};

export async function recordRankedResult({
  db,
  pairId,
  roomId,
  matchId,
  matchLogId,
  winnerAccountId,
}: Params): Promise<void> {
  await db.query("SELECT id FROM ranked_control WHERE id=1 FOR UPDATE");
  const pair = (
    await db.query<{ format: string; season_id: number; status: string; room_id: string }>(
      "SELECT * FROM ranked_pairs WHERE id=$1",
      [pairId],
    )
  ).rows[0];
  if (!pair || pair.status !== RankedQueueStatus.PLAYING.value || pair.room_id !== roomId) {
    throw new Error("ranked_result_not_playing");
  }
  const players = (
    await db.query<{ account_id: string }>(
      "SELECT account_id FROM ranked_pair_players WHERE pair_id=$1 ORDER BY seat",
      [pairId],
    )
  ).rows;
  if (players.length !== 2 || (winnerAccountId && !players.some((player) => player.account_id === winnerAccountId))) {
    throw new Error("ranked_result_invalid_players");
  }
  const ratings: number[] = [];
  for (const player of players) {
    await db.query("INSERT INTO ranked_ratings (account_id,format) VALUES ($1,$2) ON CONFLICT DO NOTHING", [
      player.account_id,
      pair.format,
    ]);
    ratings.push(
      (
        await db.query<{ rating: number }>("SELECT rating FROM ranked_ratings WHERE account_id=$1 AND format=$2", [
          player.account_id,
          pair.format,
        ])
      ).rows[0]!.rating,
    );
  }
  for (const [seat, player] of players.entries()) {
    let score: 0 | 0.5 | 1 = 0.5;
    if (winnerAccountId) {
      score = winnerAccountId === player.account_id ? 1 : 0;
    }
    const rating = calculateElo({ rating: ratings[seat]!, opponentRating: ratings[1 - seat]!, score });
    await db.query("UPDATE ranked_ratings SET rating=$3 WHERE account_id=$1 AND format=$2", [
      player.account_id,
      pair.format,
      rating,
    ]);
    const standing = (
      await db.query<{ wins: number; losses: number; draws: number; peak_rating: number | null }>(
        "SELECT wins,losses,draws,peak_rating FROM ranked_standings WHERE season_id=$1 AND account_id=$2 AND format=$3",
        [pair.season_id, player.account_id, pair.format],
      )
    ).rows[0]!;
    const games = standing.wins + standing.losses + standing.draws + 1;
    const peak = games >= 10 ? Math.max(standing.peak_rating ?? 0, rating) : null;
    await db.query(
      "UPDATE ranked_pair_players SET rating_before=$3,rating_after=$4,peak_before=$5 WHERE pair_id=$1 AND account_id=$2",
      [pairId, player.account_id, ratings[seat], rating, standing.peak_rating],
    );
    await db.query(
      "UPDATE ranked_standings SET rating=$4,peak_rating=$5,wins=wins+$6,losses=losses+$7,draws=draws+$8 WHERE season_id=$1 AND account_id=$2 AND format=$3",
      [
        pair.season_id,
        player.account_id,
        pair.format,
        rating,
        peak,
        score === 1 ? 1 : 0,
        score === 0 ? 1 : 0,
        score === 0.5 ? 1 : 0,
      ],
    );
  }
  await db.query("UPDATE ranked_pairs SET status=$2,result_id=$3,match_log_id=$4 WHERE id=$1", [
    pairId,
    RankedQueueStatus.FINISHED.value,
    matchId,
    matchLogId ?? null,
  ]);
  await db.query("DELETE FROM ranked_queue WHERE pair_id=$1", [pairId]);
}
