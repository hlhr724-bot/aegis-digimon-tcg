import type { AccountStore } from "#api/accounts/AccountStore";
import { FeedbackStore } from "#api/bugs/FeedbackStore";
import { tokenBucketLimiter } from "#api/http/rateLimit";
import type { Seat } from "@aegis/shared/schema/enums";

const HISTORY_LIMIT = 20;
const allowReport = tokenBucketLimiter({ capacity: 5, refillMs: 60_000 });

type RelayedMessage = { senderId: string | null; text: string; sentAt: number };
type RecordParams = { seat: Seat; accountId: string | undefined; text: string };
type Reporter = { seat: Seat; accountId: string };
type ReportParams = Reporter & { roomId: string; matchId: string };

export class MatchChatReports {
  private readonly messagesBySeat = new Map<Seat, RelayedMessage[]>();
  private readonly reportByAccount = new Map<string, Promise<number>>();

  constructor(
    private readonly accounts: () => AccountStore,
    private readonly now: () => number = Date.now,
  ) {}

  record({ seat, accountId, text }: RecordParams): void {
    const messages = this.messagesBySeat.get(seat) ?? [];
    this.messagesBySeat.set(seat, [
      ...messages.slice(1 - HISTORY_LIMIT),
      { senderId: accountId ?? null, text, sentAt: this.now() },
    ]);
  }

  canReport(reporter: Reporter): boolean {
    return !this.reportByAccount.has(reporter.accountId) && this.findEvidence(reporter).length > 0;
  }

  async report({ seat, accountId, roomId, matchId }: ReportParams): Promise<boolean> {
    const messages = this.findEvidence({ seat, accountId });
    let saved = this.reportByAccount.get(accountId);
    if (!saved) {
      if (!messages.length || !allowReport(accountId)) {
        return false;
      }
      saved = new FeedbackStore(this.accounts()).save(
        {
          kind: "other",
          summary: "Match chat abuse report",
          description: JSON.stringify({
            roomId,
            matchId,
            reporterId: accountId,
            reportedId: messages.at(-1)?.senderId ?? null,
            reportedAt: this.now(),
            messages,
          }),
          cardIds: [],
          matchId,
        },
        accountId,
        false,
      );
      this.reportByAccount.set(accountId, saved);
    }
    try {
      await saved;
      return true;
    } catch {
      this.reportByAccount.delete(accountId);
      return false;
    }
  }

  clear(): void {
    this.messagesBySeat.clear();
    this.reportByAccount.clear();
  }

  private findEvidence({ seat, accountId }: Reporter): RelayedMessage[] {
    const opponentSeat: Seat = seat === 0 ? 1 : 0;
    return (this.messagesBySeat.get(opponentSeat) ?? []).filter((message) => message.senderId !== accountId);
  }
}
