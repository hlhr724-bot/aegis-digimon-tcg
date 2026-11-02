import type { AccountStore } from "#api/accounts/AccountStore";
import { isTournamentDeletable } from "#api/tournaments/lifecycle/isTournamentDeletable";
import type { TournamentReport } from "@aegis/shared/tournaments/TournamentReport";
import type { TournamentReportAction } from "@aegis/shared/tournaments/TournamentReportAction";
import type { TournamentReportInput } from "@aegis/shared/tournaments/TournamentReportInput";
import type { TournamentReportReason } from "@aegis/shared/tournaments/TournamentReportReason";

const QUEUE_LIMIT = 100;

export type TournamentReportTarget = {
  id: string;
  name: string;
  createdBy: string;
};

type RecordReportParams = {
  reporterAccountId: string;
  tournament: TournamentReportTarget;
  input: TournamentReportInput;
  at?: number;
};

type ResolveReportsParams = {
  tournamentId: string;
  action: TournamentReportAction;
  adminAccountId: string;
  at?: number;
};

type OpenReport = {
  id: number;
  tournamentId: string;
};

type QueueRow = {
  id: number;
  tournament_id: string;
  tournament_name: string;
  tournament_status: string;
  organizer_name: string | null;
  reason: TournamentReportReason;
  details: string | null;
  reporter_name: string | null;
  created_at: string;
  open_reports: string;
};

export class TournamentReportStore {
  constructor(private readonly accounts: AccountStore) {}

  async findReportTarget(tournamentId: string): Promise<TournamentReportTarget | undefined> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<{ id: string; name: string; created_by: string }>(
      "SELECT id, name, created_by FROM tournaments WHERE id=$1",
      [tournamentId],
    );
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return { id: String(row.id), name: row.name, createdBy: String(row.created_by) };
  }

  async recordReport({ reporterAccountId, tournament, input, at = Date.now() }: RecordReportParams): Promise<void> {
    await this.accounts.ensureReady();
    const details = input.details ?? null;
    const updated = await this.accounts.pool.query(
      `UPDATE tournament_reports SET reason=$3, details=$4, tournament_name=$5, created_at=$6
       WHERE tournament_id=$1 AND reporter_account_id=$2 AND resolved_at IS NULL`,
      [tournament.id, reporterAccountId, input.reason, details, tournament.name, at],
    );
    if (updated.rowCount) {
      return;
    }
    await this.accounts.pool.query(
      `INSERT INTO tournament_reports (tournament_id, tournament_name, reporter_account_id, reason, details, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [tournament.id, tournament.name, reporterAccountId, input.reason, details, at],
    );
  }

  async findOpenReport(reportId: number): Promise<OpenReport | undefined> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<{ id: number; tournament_id: string }>(
      "SELECT id, tournament_id FROM tournament_reports WHERE id=$1 AND resolved_at IS NULL",
      [reportId],
    );
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return { id: Number(row.id), tournamentId: String(row.tournament_id) };
  }

  async listOpenReports(): Promise<TournamentReport[]> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<QueueRow>(
      `SELECT r.id, r.tournament_id, t.name AS tournament_name, t.status AS tournament_status,
              organizer.display_name AS organizer_name, r.reason, r.details,
              reporter.display_name AS reporter_name, r.created_at, open_counts.open_reports
       FROM tournament_reports r
       JOIN tournaments t ON t.id = r.tournament_id
       JOIN (
         SELECT tournament_id, count(*) AS open_reports
         FROM tournament_reports
         WHERE resolved_at IS NULL
         GROUP BY tournament_id
       ) open_counts ON open_counts.tournament_id = r.tournament_id
       LEFT JOIN accounts organizer ON organizer.id = t.created_by
       LEFT JOIN accounts reporter ON reporter.id = r.reporter_account_id
       WHERE r.resolved_at IS NULL
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT ${QUEUE_LIMIT}`,
    );
    return rows.map((row) => ({
      id: Number(row.id),
      tournamentId: String(row.tournament_id),
      tournamentName: row.tournament_name,
      organizerName: row.organizer_name ?? "",
      canDeleteTournament: isTournamentDeletable(row.tournament_status),
      reason: row.reason,
      details: row.details,
      reporterName: row.reporter_name,
      createdAt: Number(row.created_at),
      openReportsForTournament: Number(row.open_reports),
    }));
  }

  async resolveReports({
    tournamentId,
    action,
    adminAccountId,
    at = Date.now(),
  }: ResolveReportsParams): Promise<number> {
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query(
      `UPDATE tournament_reports SET resolved_at=$2, resolution=$3, resolved_by_account_id=$4
       WHERE tournament_id=$1 AND resolved_at IS NULL`,
      [tournamentId, at, action, adminAccountId],
    );
    return result.rowCount ?? 0;
  }
}
