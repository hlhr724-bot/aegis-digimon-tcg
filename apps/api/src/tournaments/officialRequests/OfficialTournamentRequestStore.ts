import { CLOSED_FEEDBACK_STATUSES, type FeedbackStatus } from "@aegis/shared/feedback/FeedbackStatus";
import type { OfficialTournamentRequest } from "@aegis/shared/tournaments/OfficialTournamentRequest";
import { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";
import type { PoolClient } from "pg";
import type { AccountStore } from "#api/accounts/AccountStore";
import type { NewBugReport } from "#api/bugs/GitHubIssueTracker";
import type { Queryable } from "#api/db/migrator";
import { isTournamentDeletable } from "#api/tournaments/lifecycle/isTournamentDeletable";

const KIND = "official_tournament";
const OPEN_STATUS = `status NOT IN (${CLOSED_FEEDBACK_STATUSES.map((status) => `'${status}'`).join(", ")})`;

export type OfficialTournamentRequestFailure =
  | "tournament_not_found"
  | "not_organizer"
  | "tournament_already_started"
  | "already_official"
  | "request_pending";

type SubmitParams = {
  tournamentId: string;
  accountId: string;
  reporterName: string;
  message: string | null;
  at?: number;
};

type RequestRow = {
  id: number;
  status: FeedbackStatus;
  report: NewBugReport;
  final_reply: string | null;
  created_at: string;
};

type TournamentRow = { name: string; created_by: string; status: string; category: string };

export class OfficialTournamentRequestStore {
  constructor(private readonly accounts: AccountStore) {}

  async organizerOf(tournamentId: string): Promise<string | undefined> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<{ created_by: string }>(
      "SELECT created_by FROM tournaments WHERE id=$1",
      [tournamentId],
    );
    return rows[0]?.created_by;
  }

  async latest(tournamentId: string): Promise<OfficialTournamentRequest | null> {
    await this.accounts.ensureReady();
    return this.readLatest(this.accounts.pool, tournamentId);
  }

  async submit({
    tournamentId,
    accountId,
    reporterName,
    message,
    at = Date.now(),
  }: SubmitParams): Promise<OfficialTournamentRequest | { error: OfficialTournamentRequestFailure }> {
    return this.transaction(async (client) => {
      const { rows } = await client.query<TournamentRow>(
        "SELECT name, created_by, status, category FROM tournaments WHERE id=$1 FOR UPDATE",
        [tournamentId],
      );
      const tournament = rows[0];
      if (!tournament) return { error: "tournament_not_found" as const };
      if (tournament.created_by !== accountId) return { error: "not_organizer" as const };
      if (!isTournamentDeletable(tournament.status)) return { error: "tournament_already_started" as const };
      if (tournament.category === TournamentCategory.OFFICIAL.value) return { error: "already_official" as const };
      const pending = await this.readLatest(client, tournamentId, OPEN_STATUS);
      if (pending) return { error: "request_pending" as const };

      const report: NewBugReport = {
        reporterName,
        kind: KIND,
        summary: `Official status request: ${tournament.name}`,
        description: message ?? "",
        cardIds: [],
        tournamentId,
      };
      await client.query(
        "INSERT INTO feedback_reports (reporter_account_id, report, created_at, github_status) VALUES ($1,$2,$3,'disabled')",
        [accountId, JSON.stringify(report), at],
      );
      return (await this.readLatest(client, tournamentId))!;
    });
  }

  async cancel(tournamentId: string, accountId: string): Promise<boolean> {
    await this.accounts.ensureReady();
    const { rowCount } = await this.accounts.pool.query(
      `DELETE FROM feedback_reports
       WHERE reporter_account_id=$1 AND report->>'kind'=$2 AND report->>'tournamentId'=$3 AND ${OPEN_STATUS}`,
      [accountId, KIND, tournamentId],
    );
    return (rowCount ?? 0) > 0;
  }

  private async readLatest(
    db: Queryable,
    tournamentId: string,
    condition = "true",
  ): Promise<OfficialTournamentRequest | null> {
    const { rows } = await db.query<RequestRow>(
      `SELECT id, status, report, final_reply, created_at FROM feedback_reports
       WHERE report->>'kind'=$1 AND report->>'tournamentId'=$2 AND ${condition}
       ORDER BY id DESC LIMIT 1`,
      [KIND, tournamentId],
    );
    const row = rows[0];
    if (!row) return null;
    const report: NewBugReport = typeof row.report === "string" ? JSON.parse(row.report) : row.report;
    return {
      id: row.id,
      status: row.status,
      message: report.description || null,
      finalReply: row.final_reply,
      createdAt: Number(row.created_at),
    };
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
}
