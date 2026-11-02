import type { CreateTournamentCircuitInput } from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";
import { TournamentCircuitCadence } from "@aegis/shared/tournaments/circuits/TournamentCircuitCadence";
import { computeCircuitOccurrences } from "#api/tournaments/circuits/computeCircuitOccurrences";
import {
  MAX_TOURNAMENT_NAME_LENGTH,
  MIN_TOURNAMENT_NAME_LENGTH,
  validateCreateTournament,
  type ValidatedTournament,
} from "#api/tournaments/rules/validation";

export type CircuitValidationError = { code: string; field: string };

export type ValidatedTournamentCircuit = {
  input: CreateTournamentCircuitInput;
  firstOccurrenceAt: number;
  tournament: ValidatedTournament;
};

export type CircuitValidationResult =
  | { ok: true; value: ValidatedTournamentCircuit }
  | { ok: false; errors: CircuitValidationError[] };

const HOUR_MS = 3_600_000;
const MAX_PERIOD_MS = 366 * 24 * HOUR_MS;
const MIN_LEAD_TIME_MS = HOUR_MS;
const MAX_LEAD_TIME_MS = 14 * 24 * HOUR_MS;
const MIN_CHECK_IN_WINDOW_MS = 5 * 60_000;
const MAX_CHECK_IN_WINDOW_MS = 2 * HOUR_MS;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_SLOTS = 14;
const MAX_POINTS_TIERS = 32;
const MAX_POINTS = 1000;
const MAX_PARTICIPATION_POINTS = 100;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateCreateTournamentCircuit(
  input: CreateTournamentCircuitInput,
  now: number,
): CircuitValidationResult {
  const errors: CircuitValidationError[] = [];
  const name = input.name.trim();
  if (name.length < MIN_TOURNAMENT_NAME_LENGTH || name.length > MAX_TOURNAMENT_NAME_LENGTH) {
    errors.push({ code: "name_length_invalid", field: "name" });
  }
  if ((input.description ?? "").length > MAX_DESCRIPTION_LENGTH) {
    errors.push({ code: "description_too_long", field: "description" });
  }
  if (input.endsAt <= input.startsAt || input.endsAt - input.startsAt > MAX_PERIOD_MS) {
    errors.push({ code: "period_invalid", field: "endsAt" });
  }
  if (input.endsAt <= now) {
    errors.push({ code: "period_in_past", field: "endsAt" });
  }
  const timeZoneValid = isTimeZone(input.timeZone);
  if (!timeZoneValid) {
    errors.push({ code: "time_zone_invalid", field: "timeZone" });
  }
  if (!scheduleValid(input.schedule)) {
    errors.push({ code: "slots_invalid", field: "schedule.slots" });
  }
  if (!isIntegerBetween(input.leadTimeMs, MIN_LEAD_TIME_MS, MAX_LEAD_TIME_MS)) {
    errors.push({ code: "lead_time_invalid", field: "leadTimeMs" });
  }
  if (
    !isIntegerBetween(input.checkInWindowMs, MIN_CHECK_IN_WINDOW_MS, MAX_CHECK_IN_WINDOW_MS) ||
    input.checkInWindowMs >= input.leadTimeMs
  ) {
    errors.push({ code: "check_in_window_invalid", field: "checkInWindowMs" });
  }
  if (!pointsTableValid(input.pointsTable)) {
    errors.push({ code: "points_table_invalid", field: "pointsTable" });
  }
  if (!isIntegerBetween(input.participationPoints, 0, MAX_PARTICIPATION_POINTS)) {
    errors.push({
      code: "participation_points_invalid",
      field: "participationPoints",
    });
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const firstOccurrenceAt = computeCircuitOccurrences({
    schedule: input.schedule,
    timeZone: input.timeZone,
    from: Math.max(input.startsAt, now),
    to: input.endsAt,
  })[0];
  if (firstOccurrenceAt === undefined) {
    return {
      ok: false,
      errors: [{ code: "no_occurrences", field: "schedule.slots" }],
    };
  }
  const tournament = validateCreateTournament(
    {
      ...input.template,
      name,
      startsAt: firstOccurrenceAt,
      category: TournamentCategory.OFFICIAL.value,
    },
    now,
  );
  if (!tournament.ok) {
    return {
      ok: false,
      errors: tournament.errors.map((error) => ({
        code: error.code,
        field: `template.${String(error.field)}`,
      })),
    };
  }
  return {
    ok: true,
    value: {
      input: { ...input, name },
      firstOccurrenceAt,
      tournament: tournament.value,
    },
  };
}

function isTimeZone(value: string): boolean {
  try {
    return value.length > 0 && new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone !== "";
  } catch {
    return false;
  }
}

function scheduleValid(schedule: CreateTournamentCircuitInput["schedule"]): boolean {
  const { firstDay, lastDay } =
    schedule.cadence === TournamentCircuitCadence.WEEKLY.value
      ? TournamentCircuitCadence.WEEKLY
      : TournamentCircuitCadence.MONTHLY;
  const slots =
    schedule.cadence === TournamentCircuitCadence.WEEKLY.value
      ? schedule.slots.map((slot) => ({
          day: slot.weekday,
          localTime: slot.localTime,
        }))
      : schedule.slots.map((slot) => ({
          day: slot.monthDay,
          localTime: slot.localTime,
        }));
  if (slots.length === 0 || slots.length > MAX_SLOTS) {
    return false;
  }
  const keys = new Set(slots.map((slot) => `${slot.day}:${slot.localTime}`));
  return (
    keys.size === slots.length &&
    slots.every((slot) => isIntegerBetween(slot.day, firstDay, lastDay) && LOCAL_TIME.test(slot.localTime))
  );
}

function pointsTableValid(table: CreateTournamentCircuitInput["pointsTable"]): boolean {
  if (table.length === 0 || table.length > MAX_POINTS_TIERS) {
    return false;
  }
  return table.every((tier, index) => {
    const previous = table[index - 1];
    return (
      isIntegerBetween(tier.maxPlacement, 1, 1024) &&
      isIntegerBetween(tier.points, 0, MAX_POINTS) &&
      (!previous || (tier.maxPlacement > previous.maxPlacement && tier.points <= previous.points))
    );
  });
}

function isIntegerBetween(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}
