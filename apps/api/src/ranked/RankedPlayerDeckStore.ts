import type { AccountStore } from "#api/accounts/AccountStore";
import { getRankedDeckFingerprint } from "#api/ranked/getRankedDeckFingerprint";
import { RankedDeckResult } from "@aegis/shared/ranked/RankedDeckResult";
import type { RankedPlayerDeck } from "@aegis/shared/ranked/RankedPlayerDeck";
import { RankedQueueStatus } from "@aegis/shared/ranked/RankedQueueStatus";

type Params = { accountId: string; seasonId: number; format: string; viewerId?: string };
type DeckRow = {
  main_deck: string[];
  egg_deck: string[];
  deck_name: string;
  match_id: string;
  opponent_name: string;
  result: RankedDeckResult;
  finished_at: string;
  archetype: string | null;
  rating_change: number | null;
};
type PublicationRow = { id: string; main_deck: string[]; egg_deck: string[] };

export class RankedPlayerDeckStore {
  constructor(private readonly accounts: AccountStore) {}

  async getDecks({ accountId, seasonId, format, viewerId }: Params): Promise<RankedPlayerDeck[]> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<DeckRow>(
      `SELECT d.main_deck,d.egg_deck,d.deck_name,d.match_id,d.result,m.finished_at,
        a.display_name AS opponent_name,f.archetype,
        me.rating_after-me.rating_before AS rating_change
       FROM match_deck_snapshots d
       JOIN match_records m ON m.id=d.match_id
       JOIN ranked_pairs p ON p.result_id=m.id
       JOIN ranked_pair_players me ON me.pair_id=p.id AND me.account_id=d.account_id
       JOIN ranked_pair_players opponent ON opponent.pair_id=p.id AND opponent.account_id<>d.account_id
       JOIN accounts a ON a.id=opponent.account_id
       LEFT JOIN competitive_match_facts f ON f.match_id=m.id::text AND f.account_id=d.account_id
       WHERE d.account_id=$1 AND p.season_id=$2 AND p.format=$3 AND p.voided_at IS NULL
         AND p.status=$4 AND m.mode='ranked' AND m.opponent_kind='human'
       ORDER BY m.finished_at DESC,m.id`,
      [accountId, seasonId, format, RankedQueueStatus.FINISHED.value],
    );
    const publications = await this.accounts.pool.query<PublicationRow>(
      "SELECT id,main_deck,egg_deck FROM public_decks WHERE account_id=$1 AND status='public' ORDER BY published_at DESC,id",
      [accountId],
    );
    const published = new Map<string, string>();
    for (const row of publications.rows) {
      const key = getRankedDeckFingerprint({ mainDeck: row.main_deck, eggDeck: row.egg_deck });
      if (!published.has(key)) {
        published.set(key, row.id);
      }
    }
    const decks = new Map<string, RankedPlayerDeck>();
    for (const row of rows) {
      const id = getRankedDeckFingerprint({ mainDeck: row.main_deck, eggDeck: row.egg_deck });
      let deck = decks.get(id);
      if (!deck) {
        const publicDeckId = published.get(id) ?? null;
        deck = {
          id,
          name: row.deck_name,
          archetype: row.archetype && row.archetype !== "unknown" ? row.archetype : null,
          matches: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          winrate: 0,
          lastPlayedAt: Number(row.finished_at),
          publicDeckId,
          list: publicDeckId || viewerId === accountId ? { mainDeck: row.main_deck, eggDeck: row.egg_deck } : null,
          history: [],
        };
        decks.set(id, deck);
      }
      deck.matches++;
      if (row.result === RankedDeckResult.WIN.value) {
        deck.wins++;
      } else if (row.result === RankedDeckResult.LOSS.value) {
        deck.losses++;
      } else {
        deck.draws++;
      }
      deck.winrate = deck.wins / deck.matches;
      deck.history.push({
        matchId: row.match_id,
        opponentName: row.opponent_name,
        result: row.result,
        finishedAt: Number(row.finished_at),
        ratingChange: row.rating_change,
      });
    }
    return [...decks.values()].sort(
      (a, b) => b.matches - a.matches || b.lastPlayedAt - a.lastPlayedAt || a.id.localeCompare(b.id),
    );
  }
}
