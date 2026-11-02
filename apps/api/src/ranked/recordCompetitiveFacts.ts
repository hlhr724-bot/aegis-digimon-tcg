import type { PoolClient } from "pg";
import type { DeckSnapshot } from "#api/accounts/AccountStore";

type Params = {
  db: PoolClient;
  matchId: string;
  roomId: string;
  origin: "ranked" | "tournament";
  format: string;
  accountIds: [string, string];
  decks: [DeckSnapshot, DeckSnapshot];
  winnerAccountId: string | null;
  finishedAt: number;
};

export async function recordCompetitiveFacts({
  db,
  matchId,
  roomId,
  origin,
  format,
  accountIds,
  winnerAccountId,
  finishedAt,
}: Params): Promise<void> {
  const regions = (
    await db.query<{ account_id: string; region: string }>(
      "SELECT p.account_id,p.region FROM ranked_pair_players p JOIN ranked_pairs r ON r.id=p.pair_id WHERE r.room_id=$1",
      [roomId],
    )
  ).rows;
  for (const [seat, accountId] of accountIds.entries()) {
    let result = "draw";
    if (winnerAccountId) {
      result = accountId === winnerAccountId ? "win" : "loss";
    }
    await db.query(
      "INSERT INTO competitive_match_facts (match_id,account_id,opponent_account_id,origin,format,region,archetype,opponent_archetype,classifier_version,result,finished_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10) ON CONFLICT DO NOTHING",
      [
        matchId,
        accountId,
        accountIds[1 - seat],
        origin,
        format,
        regions.find((region) => region.account_id === accountId)?.region ?? null,
        "unknown",
        "unknown",
        result,
        finishedAt,
      ],
    );
  }
}
