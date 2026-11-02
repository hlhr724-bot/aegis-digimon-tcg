import { expect, it } from "vitest";
import { getWeeklySyncPeriod } from "#api/deckProviders/getWeeklySyncPeriod";

it("rolls over Sundays at 03:00 Sao Paulo and catches up after downtime", () => {
  expect(getWeeklySyncPeriod(new Date("2026-10-18T05:59:59Z"))).toBe("2026-10-11T06:00:00.000Z");
  expect(getWeeklySyncPeriod(new Date("2026-10-18T06:00:00Z"))).toBe("2026-10-18T06:00:00.000Z");
  expect(getWeeklySyncPeriod(new Date("2026-10-21T12:00:00Z"))).toBe("2026-10-18T06:00:00.000Z");
});
