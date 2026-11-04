import type { MatchupJob } from "@aegis/shared/deckSimulation/MatchupJob";
import type { SavedMatchupResult } from "@aegis/shared/deckSimulation/SavedMatchupResult";
import type { AccountStore } from "#api/accounts/AccountStore";
import type { FinishedMatchup } from "#api/deckSimulation/FinishedMatchup";

type ResultRow = { deck_key: string; result: MatchupJob; saved_at: string | number };

export class DeckMatchupResultStore {
  constructor(
    private readonly accounts: AccountStore,
    private readonly now: () => number = Date.now,
  ) {}

  async save({ accountId, deckId, deckKey, job }: FinishedMatchup): Promise<void> {
    await this.accounts.ensureReady();
    await this.accounts.pool.query(
      `INSERT INTO deck_matchup_results (account_id, deck_id, deck_key, result, saved_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (account_id, deck_id)
       DO UPDATE SET deck_key = EXCLUDED.deck_key, result = EXCLUDED.result, saved_at = EXCLUDED.saved_at`,
      [accountId, deckId, deckKey, JSON.stringify(job), this.now()],
    );
  }

  async latest({ accountId, deckId }: { accountId: string; deckId: string }): Promise<SavedMatchupResult | undefined> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<ResultRow>(
      "SELECT deck_key, result, saved_at FROM deck_matchup_results WHERE account_id = $1 AND deck_id = $2",
      [accountId, deckId],
    );
    const row = rows[0];
    if (row === undefined) return undefined;
    return { deckKey: row.deck_key, savedAt: new Date(Number(row.saved_at)).toISOString(), job: row.result };
  }
}
