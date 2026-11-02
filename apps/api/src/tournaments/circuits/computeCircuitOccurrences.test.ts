import { describe, expect, it } from "vitest";
import { TournamentCircuitCadence } from "@aegis/shared/tournaments/circuits/TournamentCircuitCadence";
import type {
  TournamentCircuitMonthlySlot,
  TournamentCircuitWeeklySlot,
} from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import { computeCircuitOccurrences } from "#api/tournaments/circuits/computeCircuitOccurrences";

const iso = (instants: number[]) => instants.map((instant) => new Date(instant).toISOString());
const weekly = (slots: TournamentCircuitWeeklySlot[]) => ({
  cadence: TournamentCircuitCadence.WEEKLY.value,
  slots,
});
const monthly = (slots: TournamentCircuitMonthlySlot[]) => ({
  cadence: TournamentCircuitCadence.MONTHLY.value,
  slots,
});

describe("computeCircuitOccurrences", () => {
  it("lists every weekly slot inside the window in UTC order", () => {
    const occurrences = computeCircuitOccurrences({
      schedule: weekly([
        { weekday: 6, localTime: "18:00" },
        { weekday: 3, localTime: "20:30" },
      ]),
      timeZone: "America/Sao_Paulo",
      from: Date.parse("2026-11-02T00:00:00Z"),
      to: Date.parse("2026-11-16T00:00:00Z"),
    });
    expect(iso(occurrences)).toEqual([
      "2026-11-04T23:30:00.000Z",
      "2026-11-07T21:00:00.000Z",
      "2026-11-11T23:30:00.000Z",
      "2026-11-14T21:00:00.000Z",
    ]);
  });

  it("keeps the local wall-clock time across a daylight saving change", () => {
    const occurrences = computeCircuitOccurrences({
      schedule: weekly([{ weekday: 6, localTime: "18:00" }]),
      timeZone: "Europe/Berlin",
      from: Date.parse("2026-10-17T00:00:00Z"),
      to: Date.parse("2026-11-01T00:00:00Z"),
    });
    expect(iso(occurrences)).toEqual([
      "2026-10-17T16:00:00.000Z",
      "2026-10-24T16:00:00.000Z",
      "2026-10-31T17:00:00.000Z",
    ]);
  });

  it("excludes an occurrence at the window end and includes one at the start", () => {
    const start = Date.parse("2026-11-07T18:00:00Z");
    const schedule = weekly([{ weekday: 6, localTime: "18:00" }]);
    expect(
      computeCircuitOccurrences({
        schedule,
        timeZone: "UTC",
        from: start,
        to: start + 1,
      }),
    ).toEqual([start]);
    expect(
      computeCircuitOccurrences({
        schedule,
        timeZone: "UTC",
        from: start - 1,
        to: start,
      }),
    ).toEqual([]);
  });

  it("lists every monthly slot inside the window in the circuit time zone", () => {
    const occurrences = computeCircuitOccurrences({
      schedule: monthly([
        { monthDay: 15, localTime: "18:00" },
        { monthDay: 1, localTime: "20:30" },
      ]),
      timeZone: "America/Sao_Paulo",
      from: Date.parse("2026-11-01T00:00:00Z"),
      to: Date.parse("2027-01-01T03:00:00Z"),
    });
    expect(iso(occurrences)).toEqual([
      "2026-11-01T23:30:00.000Z",
      "2026-11-15T21:00:00.000Z",
      "2026-12-01T23:30:00.000Z",
      "2026-12-15T21:00:00.000Z",
    ]);
  });

  it("moves a month day the month lacks to its last day", () => {
    const occurrences = computeCircuitOccurrences({
      schedule: monthly([
        { monthDay: 30, localTime: "18:00" },
        { monthDay: 31, localTime: "18:00" },
      ]),
      timeZone: "UTC",
      from: Date.parse("2027-01-01T00:00:00Z"),
      to: Date.parse("2027-05-01T00:00:00Z"),
    });
    expect(iso(occurrences)).toEqual([
      "2027-01-30T18:00:00.000Z",
      "2027-01-31T18:00:00.000Z",
      "2027-02-28T18:00:00.000Z",
      "2027-03-30T18:00:00.000Z",
      "2027-03-31T18:00:00.000Z",
      "2027-04-30T18:00:00.000Z",
    ]);
  });
});
