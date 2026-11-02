import type {
  CommunityDeckReport,
  CommunityPublicationStatus,
  CommunityReportInput,
  CommunityReportReason,
  ReportedCommunityDeck,
} from "@aegis/shared";
import type { AccountStore } from "../accounts/AccountStore.js";

const QUEUE_LIMIT = 100;

/**
 * Player reports against public decks, kept until a moderator handles them. Hiding a deck or
 * dismissing its reports closes them; a reporter's newer report on the same deck replaces their
 * open one, so the open count is a count of distinct reporters.
 */
export class DeckReportStore {
  constructor(private readonly accounts: AccountStore) {}

  async record(reporterAccountId: string, deckId: string, input: CommunityReportInput, at = Date.now()): Promise<void> {
    await this.accounts.ensureReady();
    const details = input.details ?? null;
    const updated = await this.accounts.pool.query(
      `UPDATE community_deck_reports SET reason=$3, details=$4, created_at=$5
       WHERE public_deck_id=$1 AND reporter_account_id=$2 AND dismissed_at IS NULL`,
      [deckId, reporterAccountId, input.reason, details, at],
    );
    if (updated.rowCount) return;
    await this.accounts.pool.query(
      `INSERT INTO community_deck_reports (public_deck_id, reporter_account_id, reason, details, created_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [deckId, reporterAccountId, input.reason, details, at],
    );
  }

  /** Decks with open reports or an owner's pending review request, most recent activity first. */
  async queue(): Promise<ReportedCommunityDeck[]> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<{
      id: string;
      name: string;
      display_name: string;
      status: CommunityPublicationStatus;
      open_reports: string | null;
      last_reported_at: string | null;
      review_requested_at: string | null;
      review_note: string | null;
    }>(
      `SELECT p.id, p.name, a.display_name, p.status, r.open_reports, r.last_reported_at, p.review_requested_at, p.review_note
       FROM public_decks p
       JOIN accounts a ON a.id = p.account_id
       LEFT JOIN (
         SELECT public_deck_id, count(*) AS open_reports, max(created_at) AS last_reported_at
         FROM community_deck_reports
         WHERE dismissed_at IS NULL
         GROUP BY public_deck_id
       ) r ON r.public_deck_id = p.id
       WHERE r.public_deck_id IS NOT NULL OR p.review_requested_at IS NOT NULL
       ORDER BY GREATEST(COALESCE(r.last_reported_at, 0), COALESCE(p.review_requested_at, 0)) DESC
       LIMIT ${QUEUE_LIMIT}`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      authorName: row.display_name,
      status: row.status,
      openReports: Number(row.open_reports ?? 0),
      lastReportedAt: row.last_reported_at === null ? null : Number(row.last_reported_at),
      reviewRequestedAt: row.review_requested_at === null ? null : Number(row.review_requested_at),
      reviewNote: row.review_note,
    }));
  }

  async openReports(deckId: string): Promise<CommunityDeckReport[]> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<{
      reason: CommunityReportReason;
      details: string | null;
      display_name: string | null;
      created_at: string;
    }>(
      `SELECT r.reason, r.details, a.display_name, r.created_at
       FROM community_deck_reports r LEFT JOIN accounts a ON a.id = r.reporter_account_id
       WHERE r.public_deck_id=$1 AND r.dismissed_at IS NULL
       ORDER BY r.created_at DESC`,
      [deckId],
    );
    return rows.map((row) => ({
      reason: row.reason,
      details: row.details,
      reporterName: row.display_name,
      createdAt: Number(row.created_at),
    }));
  }

  /** Closes a deck's open reports; returns how many were open. */
  async dismiss(deckId: string, at = Date.now()): Promise<number> {
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query(
      "UPDATE community_deck_reports SET dismissed_at=$2 WHERE public_deck_id=$1 AND dismissed_at IS NULL",
      [deckId, at],
    );
    return result.rowCount ?? 0;
  }
}
