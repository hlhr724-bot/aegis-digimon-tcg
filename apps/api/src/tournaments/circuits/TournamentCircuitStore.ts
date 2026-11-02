import { randomUUID } from "node:crypto";
import type {
  TournamentCircuitEvent,
  TournamentCircuitLeaderboard,
  TournamentCircuitStanding,
  TournamentCircuitSummary,
  TournamentCircuitView,
} from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import { TournamentCircuitStatus } from "@aegis/shared/tournaments/circuits/TournamentCircuitStatus";
import type { TournamentStatus } from "@aegis/shared/tournaments/index";
import type { AccountStore } from "#api/accounts/AccountStore";
import { computeCircuitOccurrences } from "#api/tournaments/circuits/computeCircuitOccurrences";
import { rankCircuitStandings } from "#api/tournaments/circuits/rankCircuitStandings";
import type { TournamentCircuitRecord } from "#api/tournaments/circuits/TournamentCircuitRecord";
import type { TournamentCircuitRow } from "#api/tournaments/circuits/TournamentCircuitRow";
import { toTournamentCircuitRecord } from "#api/tournaments/circuits/toTournamentCircuitRecord";
import type { ValidatedTournamentCircuit } from "#api/tournaments/circuits/validateCreateTournamentCircuit";

export const CIRCUIT_LEADERBOARD_PAGE_SIZE = 50;
const UPCOMING_LIMIT = 5;

type CreateParams = {
  createdBy: string;
  circuit: ValidatedTournamentCircuit;
  now: number;
};
type LeaderboardParams = {
  circuitId: string;
  page: number;
  accountId?: string;
};
type CancelOutcome = { kind: "not_found" } | { kind: "closed" } | { kind: "cancelled"; openTournamentIds: string[] };
type TotalsRow = {
  account_id: string;
  display_name: string;
  points: string | number;
  events: string | number;
  best_placement: string | number | null;
};

export class TournamentCircuitStore {
  constructor(private readonly accounts: AccountStore) {}

  async create({ createdBy, circuit, now }: CreateParams): Promise<TournamentCircuitView> {
    await this.accounts.ensureReady();
    const { input } = circuit;
    const id = randomUUID();
    await this.accounts.pool.query(
      `INSERT INTO tournament_circuits
        (id,name,description,status,starts_at,ends_at,time_zone,cadence,slots,lead_time_ms,check_in_window_ms,template,points_table,participation_points,created_by,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        id,
        input.name,
        input.description ?? "",
        TournamentCircuitStatus.ACTIVE.value,
        input.startsAt,
        input.endsAt,
        input.timeZone,
        input.schedule.cadence,
        JSON.stringify(input.schedule.slots),
        input.leadTimeMs,
        input.checkInWindowMs,
        JSON.stringify(input.template),
        JSON.stringify(input.pointsTable),
        input.participationPoints,
        createdBy,
        now,
      ],
    );
    return (await this.view(id, now))!;
  }

  async find(id: string): Promise<TournamentCircuitRecord | undefined> {
    await this.accounts.ensureReady();
    const row = (
      await this.accounts.pool.query<TournamentCircuitRow>("SELECT * FROM tournament_circuits WHERE id=$1", [id])
    ).rows[0];
    return row ? toTournamentCircuitRecord(row) : undefined;
  }

  async list(now: number): Promise<TournamentCircuitSummary[]> {
    await this.accounts.ensureReady();
    const rows = (
      await this.accounts.pool.query<TournamentCircuitRow>(
        `SELECT * FROM tournament_circuits
         ORDER BY CASE WHEN status=$1 THEN 0 ELSE 1 END, starts_at DESC`,
        [TournamentCircuitStatus.ACTIVE.value],
      )
    ).rows;
    const locked = await this.scoredCircuitIds();
    return rows.map((row) => toSummary(toTournamentCircuitRecord(row), now, locked.has(String(row.id))));
  }

  async view(id: string, now: number): Promise<TournamentCircuitView | undefined> {
    const circuit = await this.find(id);
    if (!circuit) {
      return undefined;
    }
    const tournaments = (
      await this.accounts.pool.query<{
        id: string;
        name: string;
        starts_at: string | number;
        status: string;
      }>("SELECT id,name,starts_at,status FROM tournaments WHERE circuit_id=$1 ORDER BY starts_at", [id])
    ).rows.map((row): TournamentCircuitEvent => ({
      tournamentId: String(row.id),
      name: row.name,
      startsAt: Number(row.starts_at),
      status: (row.status === "in_progress" ? "running" : row.status) as TournamentStatus,
    }));
    const scored = await this.accounts.pool.query(
      "SELECT 1 FROM tournament_circuit_scores WHERE circuit_id=$1 LIMIT 1",
      [id],
    );
    return {
      ...toSummary(circuit, now, (scored.rowCount ?? 0) > 0),
      template: circuit.template,
      tournaments,
      upcoming: upcomingOccurrences(circuit, now).slice(0, UPCOMING_LIMIT),
    };
  }

  async cancel(id: string): Promise<CancelOutcome> {
    await this.accounts.ensureReady();
    const circuit = await this.find(id);
    if (!circuit) {
      return { kind: "not_found" };
    }
    const updated = await this.accounts.pool.query(
      "UPDATE tournament_circuits SET status=$2 WHERE id=$1 AND status=$3",
      [id, TournamentCircuitStatus.CANCELLED.value, TournamentCircuitStatus.ACTIVE.value],
    );
    if (updated.rowCount !== 1) {
      return { kind: "closed" };
    }
    const open = await this.accounts.pool.query<{ id: string }>(
      "SELECT id FROM tournaments WHERE circuit_id=$1 AND status IN ('draft','registration','check_in')",
      [id],
    );
    return {
      kind: "cancelled",
      openTournamentIds: open.rows.map((row) => String(row.id)),
    };
  }

  async standings(circuitId: string): Promise<TournamentCircuitStanding[]> {
    await this.accounts.ensureReady();
    const frozen = (
      await this.accounts.pool.query<{
        standings: TournamentCircuitStanding[] | string;
      }>("SELECT standings FROM tournament_circuit_results WHERE circuit_id=$1", [circuitId])
    ).rows[0];
    if (frozen) {
      return typeof frozen.standings === "string"
        ? (JSON.parse(frozen.standings) as TournamentCircuitStanding[])
        : frozen.standings;
    }
    return this.liveStandings(circuitId);
  }

  async liveStandings(circuitId: string): Promise<TournamentCircuitStanding[]> {
    const rows = (
      await this.accounts.pool.query<TotalsRow>(
        `SELECT p.account_id, a.display_name, SUM(p.points) AS points, COUNT(*) AS events, MIN(p.placement) AS best_placement
         FROM tournament_circuit_points p JOIN accounts a ON a.id = p.account_id
         WHERE p.circuit_id=$1
         GROUP BY p.account_id, a.display_name`,
        [circuitId],
      )
    ).rows;
    return rankCircuitStandings(
      rows.map((row) => ({
        accountId: String(row.account_id),
        displayName: row.display_name,
        points: Number(row.points),
        events: Number(row.events),
        bestPlacement: row.best_placement === null ? null : Number(row.best_placement),
      })),
    );
  }

  async leaderboard({
    circuitId,
    page,
    accountId,
  }: LeaderboardParams): Promise<TournamentCircuitLeaderboard | undefined> {
    const circuit = await this.find(circuitId);
    if (!circuit) {
      return undefined;
    }
    const standings = await this.standings(circuitId);
    const offset = (page - 1) * CIRCUIT_LEADERBOARD_PAGE_SIZE;
    return {
      circuitId,
      final: circuit.finalizedAt !== null,
      entries: standings.slice(offset, offset + CIRCUIT_LEADERBOARD_PAGE_SIZE),
      mine: accountId ? (standings.find((entry) => entry.accountId === accountId) ?? null) : null,
      page,
      total: standings.length,
    };
  }

  private async scoredCircuitIds(): Promise<Set<string>> {
    const rows = (
      await this.accounts.pool.query<{ circuit_id: string }>(
        "SELECT DISTINCT circuit_id FROM tournament_circuit_scores",
      )
    ).rows;
    return new Set(rows.map((row) => String(row.circuit_id)));
  }
}

function toSummary(circuit: TournamentCircuitRecord, now: number, scoringLocked: boolean): TournamentCircuitSummary {
  return {
    id: circuit.id,
    name: circuit.name,
    description: circuit.description,
    status: circuit.status,
    startsAt: circuit.startsAt,
    endsAt: circuit.endsAt,
    timeZone: circuit.timeZone,
    schedule: circuit.schedule,
    leadTimeMs: circuit.leadTimeMs,
    checkInWindowMs: circuit.checkInWindowMs,
    pointsTable: circuit.pointsTable,
    participationPoints: circuit.participationPoints,
    createdBy: circuit.createdBy,
    finalizedAt: circuit.finalizedAt,
    nextOccurrenceAt: upcomingOccurrences(circuit, now)[0] ?? null,
    scoringLocked,
  };
}

function upcomingOccurrences(circuit: TournamentCircuitRecord, now: number): number[] {
  if (circuit.status !== TournamentCircuitStatus.ACTIVE.value) {
    return [];
  }
  return computeCircuitOccurrences({
    schedule: circuit.schedule,
    timeZone: circuit.timeZone,
    from: Math.max(circuit.startsAt, now),
    to: circuit.endsAt,
  });
}
