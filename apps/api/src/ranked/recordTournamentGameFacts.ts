import type { PoolClient } from "pg";
import type { GameRecord, SeriesRecord } from "#api/tournaments/series/SeriesStore";
import { recordCompetitiveFacts } from "#api/ranked/recordCompetitiveFacts";

type Params = { db: PoolClient; game: GameRecord; series: SeriesRecord; result: string; finishedAt: number };

export async function recordTournamentGameFacts({ db, game, series, result, finishedAt }: Params): Promise<void> {
  const [first, second] = game.deckSnapshots;
  const [account0, account1] = series.participantAccountIds;
  if (!first || !second || !account0 || !account1 || result === "voided") {
    return;
  }
  const tournament = (
    await db.query<{ format: string }>("SELECT format FROM tournaments WHERE id=$1", [series.tournamentId])
  ).rows[0];
  if (!tournament) {
    return;
  }
  let winnerAccountId: string | null = null;
  if (result === "participant0") {
    winnerAccountId = account0;
  }
  if (result === "participant1") {
    winnerAccountId = account1;
  }
  await recordCompetitiveFacts({
    db,
    matchId: `tournament-game:${game.id}`,
    roomId: game.roomId ?? game.id,
    origin: "tournament",
    format: tournament.format,
    accountIds: [account0, account1],
    decks: [
      { deckId: first.deckId, deckName: first.name, mainDeck: first.mainDeck, eggDeck: first.eggDeck },
      { deckId: second.deckId, deckName: second.name, mainDeck: second.mainDeck, eggDeck: second.eggDeck },
    ],
    winnerAccountId,
    finishedAt,
  });
}
