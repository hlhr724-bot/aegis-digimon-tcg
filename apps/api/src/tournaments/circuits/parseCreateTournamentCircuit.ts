import { TournamentCircuitCadence } from "@aegis/shared/tournaments/circuits/TournamentCircuitCadence";
import type {
  CreateTournamentCircuitInput,
  TournamentCircuitMonthlySlot,
  TournamentCircuitPointsTier,
  TournamentCircuitSchedule,
  TournamentCircuitWeeklySlot,
} from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import { DEFAULT_CIRCUIT_SETTINGS } from "@aegis/shared/tournaments/circuits/DEFAULT_CIRCUIT_SETTINGS";
import { parseCreateTournament } from "#api/tournaments/rules/parseCreateTournament";

export function parseCreateTournamentCircuit(body: unknown): CreateTournamentCircuitInput | undefined {
  if (!isRecord(body) || !isRecord(body.template)) {
    return undefined;
  }
  const { name, description, startsAt, endsAt, timeZone } = body;
  if (typeof name !== "string" || typeof timeZone !== "string") {
    return undefined;
  }
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
    return undefined;
  }
  if (description !== undefined && typeof description !== "string") {
    return undefined;
  }
  const schedule = parseSchedule(body.schedule);
  const pointsTable =
    body.pointsTable === undefined ? [...DEFAULT_CIRCUIT_SETTINGS.pointsTable] : parseList(body.pointsTable, parseTier);
  const tournament = parseCreateTournament({
    ...body.template,
    name,
    startsAt: Number(startsAt),
  });
  if (!schedule || !pointsTable || !tournament) {
    return undefined;
  }
  const { name: _name, startsAt: _startsAt, category: _category, password: _password, ...template } = tournament.input;
  return {
    name,
    description,
    startsAt: Number(startsAt),
    endsAt: Number(endsAt),
    timeZone,
    schedule,
    leadTimeMs: numberOr(body.leadTimeMs, DEFAULT_CIRCUIT_SETTINGS.leadTimeMs),
    checkInWindowMs: numberOr(body.checkInWindowMs, DEFAULT_CIRCUIT_SETTINGS.checkInWindowMs),
    template: { ...template, block: tournament.block },
    pointsTable,
    participationPoints: numberOr(body.participationPoints, DEFAULT_CIRCUIT_SETTINGS.participationPoints),
  };
}

function parseSchedule(value: unknown): TournamentCircuitSchedule | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.cadence === TournamentCircuitCadence.WEEKLY.value) {
    const slots = parseList(value.slots, parseWeeklySlot);
    return slots && { cadence: value.cadence, slots };
  }
  if (value.cadence === TournamentCircuitCadence.MONTHLY.value) {
    const slots = parseList(value.slots, parseMonthlySlot);
    return slots && { cadence: value.cadence, slots };
  }
  return undefined;
}

function parseWeeklySlot(value: unknown): TournamentCircuitWeeklySlot | undefined {
  if (!isRecord(value) || typeof value.weekday !== "number" || typeof value.localTime !== "string") {
    return undefined;
  }
  return { weekday: value.weekday, localTime: value.localTime };
}

function parseMonthlySlot(value: unknown): TournamentCircuitMonthlySlot | undefined {
  if (!isRecord(value) || typeof value.monthDay !== "number" || typeof value.localTime !== "string") {
    return undefined;
  }
  return { monthDay: value.monthDay, localTime: value.localTime };
}

function parseTier(value: unknown): TournamentCircuitPointsTier | undefined {
  if (!isRecord(value) || typeof value.maxPlacement !== "number" || typeof value.points !== "number") {
    return undefined;
  }
  return { maxPlacement: value.maxPlacement, points: value.points };
}

function parseList<T>(value: unknown, parse: (entry: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const parsed = value.map(parse);
  return parsed.every((entry): entry is T => entry !== undefined) ? parsed : undefined;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : value === undefined ? fallback : Number.NaN;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
