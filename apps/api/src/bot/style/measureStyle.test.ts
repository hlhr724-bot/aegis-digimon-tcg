import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { measureStyleEvents } from "#api/bot/style/measureStyleEvents";
import { measureStyle } from "#api/bot/style/measureStyle";
import { runBotMatch } from "#api/bot/matchHarness";

const attack = {
  kind: "attackDeclared",
  seat: 0,
  attackerPermanentId: "attacker",
  attackerCardId: "BT1-010",
  target: { kind: "player" },
} as const;

describe("bot play style measurements", () => {
  it("counts turns once, ignores attack redirects and attributes blocks to the defender", () => {
    const events: ServerEvent[] = [
      { kind: "phaseChanged", phase: "main", turnSeat: 0, turnCount: 1 },
      { kind: "phaseChanged", phase: "end", turnSeat: 0, turnCount: 1 },
      attack,
      { ...attack, redirected: true },
      { kind: "blocked", blockerPermanentId: "defender" },
      { kind: "memoryChanged", from: 4, to: -5, reason: "cost" },
      { kind: "memoryChanged", from: -5, to: -2, reason: "effect" },
      { kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 1 },
      { kind: "phaseChanged", phase: "main", turnSeat: 1, turnCount: 2 },
      { kind: "memoryChanged", from: 2, to: -3, reason: "passTurn" },
      { kind: "turnEnded", endingSeat: 1, nextSeat: 0, turnCount: 2 },
      { kind: "phaseChanged", phase: "main", turnSeat: 0, turnCount: 3 },
      { ...attack, target: { kind: "permanent", permanentId: "defender" } },
    ];
    expect(measureStyleEvents({ events })).toEqual({
      gameLengthTurns: 3,
      seats: [
        {
          turns: 2,
          securityAttacks: 1,
          securityAttacksPerTurn: 0.5,
          memoryPassed: 2,
          memoryPassedPerTurn: 1,
          blocksDeclared: 0,
        },
        {
          turns: 1,
          securityAttacks: 0,
          securityAttacksPerTurn: 0,
          memoryPassed: 3,
          memoryPassedPerTurn: 3,
          blocksDeclared: 1,
        },
      ],
    });
  });

  it("returns finite zero metrics for a recording with no turns", () => {
    expect(measureStyleEvents({ events: [] })).toEqual({
      gameLengthTurns: 0,
      seats: Array.from({ length: 2 }, () => ({
        turns: 0,
        securityAttacks: 0,
        securityAttacksPerTurn: 0,
        memoryPassed: 0,
        memoryPassedPerTurn: 0,
        blocksDeclared: 0,
      })),
    });
  });

  it("rejects an incomplete event stream that cannot identify a blocking seat", () => {
    expect(() => measureStyleEvents({ events: [{ kind: "blocked", blockerPermanentId: "unknown" }] })).toThrow(
      "attack declaration",
    );
  });

  it("reconstructs recorder output into the same metrics as the original public events", async () => {
    const result = await runBotMatch({
      seed: 73,
      seats: [{}, {}],
      turnLimit: 10,
      captureEvents: true,
      recordReplay: true,
    });
    expect(result.errors).toEqual([]);
    expect(result.replay).toBeDefined();
    expect(await measureStyle({ replay: result.replay! })).toEqual(measureStyleEvents({ events: result.events! }));
  });
});
