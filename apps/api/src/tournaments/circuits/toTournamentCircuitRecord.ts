import type { TournamentCircuitSchedule } from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import type { TournamentCircuitRecord } from "#api/tournaments/circuits/TournamentCircuitRecord";
import type { TournamentCircuitRow } from "#api/tournaments/circuits/TournamentCircuitRow";

export function toTournamentCircuitRecord(row: TournamentCircuitRow): TournamentCircuitRecord {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description,
    status: row.status,
    startsAt: Number(row.starts_at),
    endsAt: Number(row.ends_at),
    timeZone: row.time_zone,
    schedule: {
      cadence: row.cadence,
      slots: parseJson(row.slots),
    } as TournamentCircuitSchedule,
    leadTimeMs: Number(row.lead_time_ms),
    checkInWindowMs: Number(row.check_in_window_ms),
    template: parseJson(row.template),
    pointsTable: parseJson(row.points_table),
    participationPoints: Number(row.participation_points),
    createdBy: String(row.created_by),
    finalizedAt: row.finalized_at === null ? null : Number(row.finalized_at),
  };
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}
