import { normalizeStoryCompleted } from "@aegis/shared/story/normalizeStoryCompleted";
import type { AccountStore } from "#api/accounts/AccountStore";
import type { StoryProgress } from "@aegis/shared/story/StoryBattle";

type RecordGuestVictoryParams = { guestHash: string; battleId: string; matchId: string };

type RecordVictoryParams = { accountId: string; battleId: string; matchId: string };

export class StoryProgressStore {
  constructor(private readonly accounts: AccountStore) {}

  async getProgress(accountId: string): Promise<StoryProgress> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<{ battle_id: string }>(
      "SELECT battle_id FROM story_battle_completions WHERE account_id=$1 ORDER BY completed_at, battle_id",
      [accountId],
    );
    return { completed: normalizeStoryCompleted({ completed: rows.map((row) => row.battle_id) }) };
  }

  async recordVictory({ accountId, battleId, matchId }: RecordVictoryParams): Promise<void> {
    await this.accounts.ensureReady();
    await this.accounts.pool.query(
      "INSERT INTO story_battle_completions (account_id, battle_id, match_id, completed_at) VALUES ($1, $2, $3, $4) ON CONFLICT (account_id, battle_id) DO NOTHING",
      [accountId, normalizeStoryCompleted({ completed: [battleId] })[0], matchId, Date.now()],
    );
  }
  async getGuestProgress(guestHash: string): Promise<StoryProgress> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<{ battle_id: string }>(
      "SELECT battle_id FROM story_guest_completions WHERE guest_hash=$1 ORDER BY completed_at, battle_id",
      [guestHash],
    );
    return { completed: normalizeStoryCompleted({ completed: rows.map((row) => row.battle_id) }) };
  }

  async recordGuestVictory({ guestHash, battleId, matchId }: RecordGuestVictoryParams): Promise<void> {
    await this.accounts.ensureReady();
    await this.accounts.pool.query(
      "INSERT INTO story_guest_completions (guest_hash, battle_id, match_id, completed_at) VALUES ($1, $2, $3, $4) ON CONFLICT (guest_hash, battle_id) DO NOTHING",
      [guestHash, normalizeStoryCompleted({ completed: [battleId] })[0], matchId, Date.now()],
    );
  }
}
