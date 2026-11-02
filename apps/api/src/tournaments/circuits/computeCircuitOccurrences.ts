import { TournamentCircuitCadence } from "@aegis/shared/tournaments/circuits/TournamentCircuitCadence";
import type { TournamentCircuitSchedule } from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";

type Params = {
  schedule: TournamentCircuitSchedule;
  timeZone: string;
  from: number;
  to: number;
};

type LocalDate = { year: number; month: number; day: number };

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

export function computeCircuitOccurrences({ schedule, timeZone, from, to }: Params): number[] {
  if (to <= from || schedule.slots.length === 0) {
    return [];
  }
  const first = toLocalDate(from - DAY_MS, timeZone);
  const days = Math.ceil((to - from) / DAY_MS) + 3;
  const occurrences = new Set<number>();
  for (let offset = 0; offset < days; offset += 1) {
    const calendarDay = new Date(Date.UTC(first.year, first.month - 1, first.day + offset));
    for (const localTime of localTimesOn(schedule, calendarDay)) {
      const [hour, minute] = localTime.split(":").map(Number);
      const instant = toZonedInstant({
        year: calendarDay.getUTCFullYear(),
        month: calendarDay.getUTCMonth() + 1,
        day: calendarDay.getUTCDate(),
        hour: hour ?? 0,
        minute: minute ?? 0,
        timeZone,
      });
      if (instant >= from && instant < to) {
        occurrences.add(instant);
      }
    }
  }
  return [...occurrences].sort((left, right) => left - right);
}

function localTimesOn(schedule: TournamentCircuitSchedule, calendarDay: Date): string[] {
  if (schedule.cadence === TournamentCircuitCadence.WEEKLY.value) {
    const weekday = calendarDay.getUTCDay();
    return schedule.slots.filter((slot) => slot.weekday === weekday).map((slot) => slot.localTime);
  }
  const lastDayOfMonth = new Date(
    Date.UTC(calendarDay.getUTCFullYear(), calendarDay.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const day = calendarDay.getUTCDate();
  return schedule.slots.filter((slot) => Math.min(slot.monthDay, lastDayOfMonth) === day).map((slot) => slot.localTime);
}

function toZonedInstant({
  year,
  month,
  day,
  hour,
  minute,
  timeZone,
}: LocalDate & { hour: number; minute: number; timeZone: string }): number {
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  const estimate = wallClock - getOffsetMs(wallClock, timeZone);
  return wallClock - getOffsetMs(estimate, timeZone);
}

function toLocalDate(instant: number, timeZone: string): LocalDate {
  const parts = readParts(instant, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

function getOffsetMs(instant: number, timeZone: string): number {
  const parts = readParts(instant, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

function readParts(instant: number, timeZone: string) {
  const values = Object.fromEntries(
    getFormatter(timeZone)
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year ?? 0,
    month: values.month ?? 1,
    day: values.day ?? 1,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatters.set(timeZone, formatter);
  return formatter;
}
