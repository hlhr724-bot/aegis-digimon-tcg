import { QuickMatchPolicy } from "#api/rooms/QuickMatchPolicy";
import type { Presence } from "colyseus";

type Params = { presence: Pick<Presence, "get" | "setex"> };

export class QuickMatchPreference {
  constructor(private readonly params: Params) {}

  async recordOpponents(accountIds: readonly [string, string]): Promise<void> {
    const [first, second] = accountIds;
    await Promise.all([
      this.params.presence.setex(`aegis:quick-opponent:${first}`, second, QuickMatchPolicy.opponentRetentionSeconds),
      this.params.presence.setex(`aegis:quick-opponent:${second}`, first, QuickMatchPolicy.opponentRetentionSeconds),
    ]);
  }

  async isRecentOpponent(accountId: string, opponentId: string): Promise<boolean> {
    const [first, second] = await Promise.all([
      this.params.presence.get(`aegis:quick-opponent:${accountId}`),
      this.params.presence.get(`aegis:quick-opponent:${opponentId}`),
    ]);
    return first === opponentId || second === accountId;
  }
}
