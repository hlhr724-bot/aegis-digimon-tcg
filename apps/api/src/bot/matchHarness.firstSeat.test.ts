import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import type { Seat } from "@aegis/shared/schema/enums";
import { runBotMatch } from "#api/bot/matchHarness";

async function findStartingSeat(firstSeat: Seat | undefined): Promise<Seat | undefined> {
  const result = await runBotMatch({
    seed: 42,
    firstSeat,
    seats: [{}, {}],
    turnLimit: 1,
    captureEvents: true,
    captureEventFilter: (event: ServerEvent) => event.kind === "matchStarted",
  });
  const started = result.events?.find((event) => event.kind === "matchStarted");
  return started?.kind === "matchStarted" ? started.firstSeat : undefined;
}

describe("bot match first player", () => {
  it("starts with the requested seat regardless of seed parity", async () => {
    expect(await findStartingSeat(undefined)).toBe(0);
    expect(await findStartingSeat(1)).toBe(1);
    expect(await findStartingSeat(0)).toBe(0);
  });
});
