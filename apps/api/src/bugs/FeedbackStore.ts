import { FeedbackStatus, CLOSED_FEEDBACK_STATUSES, FEEDBACK_STATUSES } from "@aegis/shared/feedback/FeedbackStatus";
import { FEEDBACK_REOPEN_WINDOW_MS } from "@aegis/shared/feedback/limits";
import { isClosedFeedbackStatus } from "@aegis/shared/feedback/isClosedFeedbackStatus";
import {
  type FeedbackKind,
  type FeedbackReopenFailure,
  type FeedbackStatusChange,
  type FeedbackTriageFailure,
  type FeedbackTriageUpdate,
  type OwnFeedbackPage,
  type OwnFeedbackReport,
} from "@aegis/shared/feedback/types";
import { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";
import type { PoolClient } from "pg";
import type { AccountStore } from "#api/accounts/AccountStore";
import type { Queryable } from "#api/db/migrator";
import { notify } from "#api/notifications/NotificationStore";
import type { ReplayRecord } from "#api/replays/inputs/types";
import type { FiledBugReport, NewBugReport } from "#api/bugs/GitHubIssueTracker";
import { replayRetentionMs } from "#api/bugs/replayRetentionMs";

const PAGE_SIZE = 50;
const OWN_PAGE_SIZE = 20;
const REPLY_EXCERPT = 160;

export type FeedbackRecord = {
  id: number;
  report: NewBugReport & { serverRevision?: string; publicVersion?: string };
  createdAt: number;
  githubStatus: "pending" | "sent" | "failed" | "disabled";
  githubNumber: number | null;
  githubUrl: string | null;
  status: FeedbackStatus;
  finalReply: string | null;
  internalNote: string | null;
  duplicateOfId: number | null;
  revision: number;
  /** Only a signed-in reporter can be notified; anonymous reports stay silent. */
  hasReporterAccount: boolean;
  /** When the reporter said the answer did not solve it. */
  reopenedAt: number | null;
  /** An admin confirmed it as a real bug; a signed-in reporter earned a point for it. */
  confirmedBug: boolean;
  /** Whether a private replay of the reported match is stored with the report. */
  hasReplay: boolean;
  replayInputs: number | null;
};

export type FeedbackStoreOptions = {
  /** How long a saved replay is kept; defaults to {@link replayRetentionMs}. */
  replayRetentionMs?: number;
  now?: () => number;
};

export type FeedbackHistoryEntry = FeedbackStatusChange & { actorName: string | null };
export type FeedbackDetail = FeedbackRecord & {
  history: FeedbackHistoryEntry[];
  /** The reporter's points across all their reports; null for an anonymous report. */
  reporterConfirmedBugs: number | null;
};

export type FeedbackFilter = {
  status?: FeedbackStatus;
  /** Only reports their reporter reopened and that are still open. */
  reopened?: boolean;
  kind?: FeedbackKind;
  search?: string;
  before?: number;
};
export type FeedbackListPage = {
  items: FeedbackRecord[];
  nextBefore: number | null;
  counts: Record<FeedbackStatus, number>;
  reopenedCount: number;
};

type FeedbackRow = {
  id: number;
  report: FeedbackRecord["report"];
  created_at: string;
  github_status: FeedbackRecord["githubStatus"];
  github_number: number | null;
  github_url: string | null;
  status: FeedbackStatus;
  final_reply: string | null;
  internal_note: string | null;
  duplicate_of_id: number | null;
  revision: number;
  reporter_account_id: string | null;
  closed_at: string | null;
  reopened_at: string | null;
  confirmed_bug: boolean;
};

const FEEDBACK_COLUMNS =
  "id, report, created_at, github_status, github_number, github_url, status, final_reply, internal_note, duplicate_of_id, revision, reporter_account_id, closed_at, reopened_at, confirmed_bug";
/** A report row with the input count of its stored replay; `input_count` is null when it has none. */
type FeedbackRecordRow = FeedbackRow & { input_count: number | null };
const SELECT_WITH_REPLAY = `SELECT ${FEEDBACK_COLUMNS.split(", ")
  .map((column) => `f.${column}`)
  .join(", ")}, r.input_count
  FROM feedback_reports f LEFT JOIN feedback_report_replays r ON r.report_id = f.id`;
const CLOSED_LIST = CLOSED_FEEDBACK_STATUSES.map((status) => `'${status}'`).join(", ");
const AWAITING_AFTER_REOPEN = `reopened_at IS NOT NULL AND status NOT IN (${CLOSED_LIST})`;

export class FeedbackStore {
  private readonly replayRetentionMs: number;
  private readonly now: () => number;

  constructor(
    private readonly accounts: AccountStore,
    options: FeedbackStoreOptions = {},
  ) {
    this.replayRetentionMs = options.replayRetentionMs ?? replayRetentionMs();
    this.now = options.now ?? Date.now;
  }

  async save(report: NewBugReport, accountId: string | undefined, mirror: boolean): Promise<number> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<{ id: number }>(
      "INSERT INTO feedback_reports (reporter_account_id, report, created_at, github_status) VALUES ($1,$2,$3,$4) RETURNING id",
      [
        accountId ?? null,
        JSON.stringify({
          ...report,
          serverRevision: process.env.AEGIS_REVISION,
          publicVersion: process.env.AEGIS_PUBLIC_VERSION,
        }),
        Date.now(),
        mirror ? "pending" : "disabled",
      ],
    );
    return rows[0]!.id;
  }

  async recordMirror(id: number, issue?: FiledBugReport): Promise<void> {
    await this.accounts.pool.query(
      "UPDATE feedback_reports SET github_status=$1, github_number=$2, github_url=$3 WHERE id=$4",
      [issue ? "sent" : "failed", issue?.number ?? null, issue?.url ?? null, id],
    );
  }

  /** The admin inbox, newest first. Counts ignore the status filter so every chip stays meaningful. */
  async list(filter: FeedbackFilter = {}): Promise<FeedbackListPage> {
    await this.accounts.ensureReady();
    // An expired replay must not be listed as available; downloading it would 404.
    await this.pruneReplays();
    const scope = new Conditions();
    if (filter.kind) scope.add("report->>'kind' = ?", filter.kind);
    if (filter.search) {
      const pattern = `%${filter.search.replace(/[\\%_]/g, "\\$&")}%`;
      const id = /^#?(\d{1,9})$/.exec(filter.search)?.[1];
      if (id) scope.add("(id = ? OR report::text ILIKE ?)", Number(id), pattern);
      else scope.add("report::text ILIKE ?", pattern);
    }
    const page = scope.clone();
    if (filter.status) page.add("status = ?", filter.status);
    if (filter.reopened) page.add(AWAITING_AFTER_REOPEN);
    if (filter.before !== undefined) page.add("id < ?", filter.before);

    const { rows } = await this.accounts.pool.query<FeedbackRecordRow>(
      `${SELECT_WITH_REPLAY} ${page.where()} ORDER BY f.id DESC LIMIT ${PAGE_SIZE + 1}`,
      page.values,
    );
    const { rows: tallies } = await this.accounts.pool.query<{
      status: FeedbackStatus;
      count: string;
      reopened: string;
    }>(
      `SELECT status, count(*) AS count,
         sum(CASE WHEN ${AWAITING_AFTER_REOPEN} THEN 1 ELSE 0 END) AS reopened
       FROM feedback_reports ${scope.where()} GROUP BY status`,
      scope.values,
    );
    const counts = Object.fromEntries(FEEDBACK_STATUSES.map((status) => [status, 0])) as Record<FeedbackStatus, number>;
    let reopenedCount = 0;
    for (const tally of tallies) {
      counts[tally.status] = Number(tally.count);
      reopenedCount += Number(tally.reopened);
    }
    const items = rows.slice(0, PAGE_SIZE).map(toRecord);
    return { items, nextBefore: rows.length > PAGE_SIZE ? items.at(-1)!.id : null, counts, reopenedCount };
  }

  async detail(id: number): Promise<FeedbackDetail | undefined> {
    await this.accounts.ensureReady();
    await this.pruneReplays();
    return this.readDetail(this.accounts.pool, id);
  }

  /**
   * Applies an admin's triage edit. The status change, its history entry and the reporter's
   * notification commit together, so the reporter is never told about an edit that was rolled back.
   */
  async triage(
    id: number,
    actorAccountId: string,
    update: FeedbackTriageUpdate,
    at = Date.now(),
  ): Promise<
    | FeedbackDetail
    | { error: Extract<FeedbackTriageFailure, "not_found" | "stale_revision" | "invalid_duplicate_target"> }
  > {
    return this.transaction(async (client) => {
      const { rows } = await client.query<FeedbackRow>(
        `SELECT ${FEEDBACK_COLUMNS} FROM feedback_reports WHERE id=$1 FOR UPDATE`,
        [id],
      );
      const current = rows[0];
      if (!current) return { error: "not_found" as const };
      if (current.revision !== update.revision) return { error: "stale_revision" as const };

      const duplicateOfId = update.status === FeedbackStatus.DUPLICATE.value ? update.duplicateOfId : null;
      if (duplicateOfId !== null) {
        const target = await client.query("SELECT 1 FROM feedback_reports WHERE id=$1", [duplicateOfId]);
        if (duplicateOfId === id || target.rows.length === 0) return { error: "invalid_duplicate_target" as const };
      }
      const finalReply = update.finalReply.trim() || null;
      const internalNote = update.internalNote.trim() || null;
      const closed = isClosedFeedbackStatus(update.status);
      const closedAt = !closed ? null : isClosedFeedbackStatus(current.status) ? current.closed_at : at;
      const confirmedBug =
        update.status !== FeedbackStatus.DUPLICATE.value && (update.confirmedBug ?? current.confirmed_bug);

      await client.query(
        `UPDATE feedback_reports
         SET status=$2, final_reply=$3, internal_note=$4, duplicate_of_id=$5, closed_at=$6, confirmed_bug=$7,
           revision=revision+1
         WHERE id=$1`,
        [id, update.status, finalReply, internalNote, duplicateOfId, closedAt, confirmedBug],
      );
      if (current.reporter_account_id && confirmedBug !== current.confirmed_bug) {
        await client.query(
          "UPDATE accounts SET confirmed_bug_reports = GREATEST(0, confirmed_bug_reports + $2) WHERE id=$1",
          [current.reporter_account_id, confirmedBug ? 1 : -1],
        );
      }

      const statusChanged = current.status !== update.status;
      const approvesOfficialTournament =
        statusChanged &&
        update.status === FeedbackStatus.RESOLVED.value &&
        current.report.kind === "official_tournament" &&
        current.report.tournamentId !== undefined;
      if (approvesOfficialTournament) {
        await client.query("UPDATE tournaments SET category=$2 WHERE id=$1", [
          current.report.tournamentId,
          TournamentCategory.OFFICIAL.value,
        ]);
      }
      if (statusChanged) {
        await client.query(
          "INSERT INTO feedback_status_events (feedback_id, actor_account_id, from_status, to_status, created_at) VALUES ($1,$2,$3,$4,$5)",
          [id, actorAccountId, current.status, update.status, at],
        );
      }
      const replyChanged = closed && finalReply !== current.final_reply;
      const duplicateChanged = closed && duplicateOfId !== current.duplicate_of_id;
      const bugConfirmed = confirmedBug && !current.confirmed_bug;
      if (current.reporter_account_id && (statusChanged || replyChanged || duplicateChanged || bugConfirmed)) {
        await notify(client, {
          accountId: current.reporter_account_id,
          kind: "feedback_update",
          subject: `feedback:${id}`,
          payload: {
            feedbackId: id,
            summary: current.report.summary,
            status: update.status,
            previousStatus: current.status,
            replyExcerpt: closed && finalReply ? excerpt(finalReply) : null,
            bugConfirmed,
          },
          at,
        });
      }
      return (await this.readDetail(client, id))!;
    });
  }

  /**
   * The reporter says the closing answer did not solve their problem. The report goes back to
   * triage with their comment in its history. Each report can be reopened this way once, within
   * the window after it closed.
   */
  async reopen(
    accountId: string,
    id: number,
    comment: string,
    at = Date.now(),
  ): Promise<OwnFeedbackReport | { error: Exclude<FeedbackReopenFailure, "empty_comment" | "comment_too_long"> }> {
    return this.transaction(async (client) => {
      const { rows } = await client.query<FeedbackRow>(
        `SELECT ${FEEDBACK_COLUMNS} FROM feedback_reports WHERE id=$1 AND reporter_account_id=$2 FOR UPDATE`,
        [id, accountId],
      );
      const current = rows[0];
      if (!current) return { error: "not_found" as const };
      if (!isClosedFeedbackStatus(current.status)) return { error: "not_closed" as const };
      if (current.reopened_at !== null) return { error: "already_reopened" as const };
      const deadline = reopenDeadline(current);
      if (deadline === null || deadline < at) return { error: "reopen_window_closed" as const };

      await client.query(
        "UPDATE feedback_reports SET status=$3, closed_at=NULL, reopened_at=$2, revision=revision+1 WHERE id=$1",
        [id, at, FeedbackStatus.TRIAGED.value],
      );
      await client.query(
        `INSERT INTO feedback_status_events (feedback_id, actor_account_id, from_status, to_status, by_reporter, comment, created_at)
         VALUES ($1,$2,$3,$6,true,$4,$5)`,
        [id, accountId, current.status, comment, at, FeedbackStatus.TRIAGED.value],
      );
      return (await this.readOwnWith(client, accountId, id))!;
    });
  }

  /** The reporter's own reports. A reply is shown only once the report is closed or was reopened. */
  async listOwn(accountId: string, before?: number): Promise<OwnFeedbackPage> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<FeedbackRow>(
      `SELECT ${FEEDBACK_COLUMNS} FROM feedback_reports
       WHERE reporter_account_id=$1 ${before === undefined ? "" : "AND id < $2"}
       ORDER BY id DESC LIMIT ${OWN_PAGE_SIZE + 1}`,
      before === undefined ? [accountId] : [accountId, before],
    );
    const page = rows.slice(0, OWN_PAGE_SIZE);
    const histories = await this.histories(
      this.accounts.pool,
      page.map((row) => row.id),
    );
    const items = page.map((row) => toOwnReport(row, histories.get(row.id) ?? []));
    const { rows: points } = await this.accounts.pool.query<{ confirmed_bug_reports: number }>(
      "SELECT confirmed_bug_reports FROM accounts WHERE id=$1",
      [accountId],
    );
    return {
      items,
      nextBefore: rows.length > OWN_PAGE_SIZE ? items.at(-1)!.id : null,
      confirmedBugs: points[0]?.confirmed_bug_reports ?? 0,
    };
  }

  async readOwn(accountId: string, id: number): Promise<OwnFeedbackReport | undefined> {
    await this.accounts.ensureReady();
    return this.readOwnWith(this.accounts.pool, accountId, id);
  }

  private async readOwnWith(db: Queryable, accountId: string, id: number): Promise<OwnFeedbackReport | undefined> {
    const { rows } = await db.query<FeedbackRow>(
      `SELECT ${FEEDBACK_COLUMNS} FROM feedback_reports WHERE id=$1 AND reporter_account_id=$2`,
      [id, accountId],
    );
    const row = rows[0];
    if (!row) return undefined;
    const histories = await this.histories(db, [id]);
    return toOwnReport(row, histories.get(id) ?? []);
  }

  private async readDetail(db: Queryable, id: number): Promise<FeedbackDetail | undefined> {
    const { rows } = await db.query<FeedbackRecordRow>(`${SELECT_WITH_REPLAY} WHERE f.id=$1`, [id]);
    const row = rows[0];
    if (!row) return undefined;
    const histories = await this.histories(db, [id]);
    const { rows: points } = row.reporter_account_id
      ? await db.query<{ confirmed_bug_reports: number }>("SELECT confirmed_bug_reports FROM accounts WHERE id=$1", [
          row.reporter_account_id,
        ])
      : { rows: [] };
    return {
      ...toRecord(row),
      reporterConfirmedBugs: row.reporter_account_id ? (points[0]?.confirmed_bug_reports ?? 0) : null,
      history: [
        {
          from: null,
          to: FeedbackStatus.NEW.value,
          at: Number(row.created_at),
          byReporter: false,
          comment: null,
          actorName: null,
        },
        ...(histories.get(id) ?? []),
      ],
    };
  }

  private async histories(db: Queryable, ids: readonly number[]): Promise<Map<number, FeedbackHistoryEntry[]>> {
    const histories = new Map<number, FeedbackHistoryEntry[]>();
    if (!ids.length) return histories;
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(",");
    const { rows } = await db.query<{
      feedback_id: number;
      from_status: FeedbackStatus;
      to_status: FeedbackStatus;
      by_reporter: boolean;
      comment: string | null;
      created_at: string;
      display_name: string | null;
    }>(
      `SELECT e.feedback_id, e.from_status, e.to_status, e.by_reporter, e.comment, e.created_at, a.display_name
       FROM feedback_status_events e LEFT JOIN accounts a ON a.id = e.actor_account_id
       WHERE e.feedback_id IN (${placeholders}) ORDER BY e.id`,
      [...ids],
    );
    for (const row of rows) {
      const entries = histories.get(row.feedback_id) ?? [];
      entries.push({
        from: row.from_status,
        to: row.to_status,
        at: Number(row.created_at),
        byReporter: row.by_reporter,
        comment: row.comment,
        actorName: row.display_name,
      });
      histories.set(row.feedback_id, entries);
    }
    return histories;
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    await this.accounts.ensureReady();
    const client = await this.accounts.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Keeps the replay of the reported match with the report. Expired replays are pruned here, at
   * save time: captures only happen for accepted, rate-limited reports, so this runs rarely and
   * needs no timer of its own.
   */
  async saveReplay(reportId: number, record: ReplayRecord): Promise<void> {
    await this.accounts.pool.query(
      "INSERT INTO feedback_report_replays (report_id, record, input_count, created_at) VALUES ($1,$2,$3,$4)",
      [reportId, JSON.stringify(record), record.inputs.length, this.now()],
    );
    await this.pruneReplays();
  }

  /** The stored replay of a report, or undefined when it has none (or it has expired). */
  async replay(reportId: number): Promise<ReplayRecord | undefined> {
    await this.accounts.ensureReady();
    await this.pruneReplays();
    const { rows } = await this.accounts.pool.query<{ record: ReplayRecord | string }>(
      "SELECT record FROM feedback_report_replays WHERE report_id=$1",
      [reportId],
    );
    const record = rows[0]?.record;
    return typeof record === "string" ? (JSON.parse(record) as ReplayRecord) : record;
  }

  /** Deletes replays older than the retention window; returns how many went. */
  async pruneReplays(): Promise<number> {
    const { rowCount } = await this.accounts.pool.query("DELETE FROM feedback_report_replays WHERE created_at < $1", [
      this.now() - this.replayRetentionMs,
    ]);
    return rowCount ?? 0;
  }
}

/** Builds a WHERE clause with numbered placeholders from `?` markers. */
class Conditions {
  private readonly clauses: string[] = [];
  readonly values: unknown[] = [];

  add(clause: string, ...values: unknown[]): void {
    let next = 0;
    this.clauses.push(
      clause.replace(/\?/g, () => {
        this.values.push(values[next++]);
        return `$${this.values.length}`;
      }),
    );
  }

  clone(): Conditions {
    const copy = new Conditions();
    copy.clauses.push(...this.clauses);
    copy.values.push(...this.values);
    return copy;
  }

  where(): string {
    return this.clauses.length ? `WHERE ${this.clauses.join(" AND ")}` : "";
  }
}

function toRecord(row: FeedbackRecordRow): FeedbackRecord {
  return {
    id: row.id,
    report: row.report,
    createdAt: Number(row.created_at),
    githubStatus: row.github_status,
    githubNumber: row.github_number,
    githubUrl: row.github_url,
    status: row.status,
    finalReply: row.final_reply,
    internalNote: row.internal_note,
    duplicateOfId: row.duplicate_of_id,
    revision: row.revision,
    hasReporterAccount: row.reporter_account_id !== null,
    reopenedAt: row.reopened_at === null ? null : Number(row.reopened_at),
    confirmedBug: row.confirmed_bug,
    hasReplay: row.input_count !== null,
    replayInputs: row.input_count,
  };
}

/** Until when the reporter may still reopen this report, or null when they no longer can. */
function reopenDeadline(row: FeedbackRow): number | null {
  if (!isClosedFeedbackStatus(row.status) || row.reopened_at !== null || row.closed_at === null) return null;
  return Number(row.closed_at) + FEEDBACK_REOPEN_WINDOW_MS;
}

function toOwnReport(row: FeedbackRow, history: FeedbackHistoryEntry[]): OwnFeedbackReport {
  const closed = isClosedFeedbackStatus(row.status);
  // After a reopen the earlier answer stays visible: it is what the reporter is disputing.
  const answered = closed || row.reopened_at !== null;
  return {
    id: row.id,
    kind: row.report.kind,
    summary: row.report.summary,
    description: row.report.description,
    cardIds: [...row.report.cardIds],
    createdAt: Number(row.created_at),
    status: row.status,
    finalReply: answered ? row.final_reply : null,
    duplicateOfId: closed ? row.duplicate_of_id : null,
    history: [
      { from: null, to: FeedbackStatus.NEW.value, at: Number(row.created_at), byReporter: false, comment: null },
      ...history.map(({ from, to, at, byReporter, comment }) => ({ from, to, at, byReporter, comment })),
    ],
    reopenDeadline: reopenDeadline(row),
    confirmedBug: row.confirmed_bug,
  };
}

function excerpt(text: string): string {
  return text.length > REPLY_EXCERPT ? `${text.slice(0, REPLY_EXCERPT - 1).trimEnd()}…` : text;
}
