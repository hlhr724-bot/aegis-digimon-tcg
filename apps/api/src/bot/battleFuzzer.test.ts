import { describe, expect, it, vi } from "vitest";
import { type MatchResult, runBotMatch } from "./matchHarness.js";
import { createMatchups, runBattleFuzz, type FuzzDeck } from "./battleFuzzer.js";
import { createEvaluationPolicy } from "#api/bot/policy";
import type { GameEngine } from "#api/engine/GameEngine";

const deck = { mainDeck: [], eggDeck: [] };
const decks: FuzzDeck[] = [
  { id: "a", deck },
  { id: "b", deck },
];

function result(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    seed: 1,
    winnerSeat: 0,
    reason: "security",
    turnCount: 4,
    timedOut: false,
    rejections: [],
    errors: [],
    seats: [
      {
        label: "a",
        attacksDeclared: 0,
        securityAttacksDeclared: 0,
        securityCardsTaken: 0,
        digimonPlayed: 0,
        digivolutions: 0,
        turnsTaken: 1,
        decisionLatenciesMs: [],
        inferenceFallbacks: { timeout: 0, error: 0 },
      },
      {
        label: "b",
        attacksDeclared: 0,
        securityAttacksDeclared: 0,
        securityCardsTaken: 0,
        digimonPlayed: 0,
        digivolutions: 0,
        turnsTaken: 1,
        decisionLatenciesMs: [],
        inferenceFallbacks: { timeout: 0, error: 0 },
      },
    ],
    events: [
      { kind: "matchStarted", firstSeat: 0 },
      { kind: "gameOver", result: { outcome: "win", winnerSeat: 0 }, reason: "security" },
    ],
    ...overrides,
  };
}

describe("battle fuzzer", () => {
  it("builds complete ordered and unordered matchup matrices", () => {
    expect(createMatchups(decks, true).map(([a, b]) => `${a.id}-${b.id}`)).toEqual(["a-a", "a-b", "b-a", "b-b"]);
    expect(createMatchups(decks, false).map(([a, b]) => `${a.id}-${b.id}`)).toEqual(["a-a", "a-b", "b-b"]);
  });

  it("uses deterministic seeds and reports a replayable presentation failure", async () => {
    const runMatch = vi
      .fn<typeof runBotMatch>()
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(
        result({
          events: [
            {
              kind: "effectTriggered",
              seat: 0,
              sourceCardId: "EX12-046",
              effectKey: "when-digivolving",
              description: "Do something",
            },
          ],
        }),
      );

    const report = await runBattleFuzz({ decks, maximumMatchups: 1, seedsPerMatchup: 2, baseSeed: 100, runMatch });

    expect(runMatch.mock.calls.map(([options]) => options.seed)).toEqual([100, 8_019]);
    expect(report.matchCount).toBe(2);
    expect(report.failures).toEqual([
      expect.objectContaining({
        decks: ["a", "a"],
        seed: 8_019,
        presentationAnomalies: [expect.objectContaining({ kind: "effect-not-resolved" })],
      }),
    ]);
  });

  it("keeps reversed seat failures tied to their public event trace and replay seed", async () => {
    const calls: { seats: string[]; seed: number; captureEvents: boolean | undefined }[] = [];
    const runMatch: typeof runBotMatch = async (options) => {
      const labels = options.seats.map((seat) => seat.label ?? "");
      calls.push({ seats: labels, seed: options.seed, captureEvents: options.captureEvents });
      return result({
        seed: options.seed,
        events:
          labels.join("-") === "b-a"
            ? [
                {
                  kind: "effectTriggered",
                  seat: 1,
                  sourceCardId: "BT1-009",
                  effectKey: "on-play",
                  description: "Triggered",
                },
              ]
            : result().events,
      });
    };

    const options = { decks, orderedSeats: true, seedsPerMatchup: 1, baseSeed: 17, runMatch };
    const first = await runBattleFuzz(options);
    const replay = await runBattleFuzz(options);

    expect(replay).toEqual(first);
    expect(calls.slice(0, 4)).toEqual([
      { seats: ["a", "a"], seed: 17, captureEvents: true },
      { seats: ["a", "b"], seed: 104_746, captureEvents: true },
      { seats: ["b", "a"], seed: 209_475, captureEvents: true },
      { seats: ["b", "b"], seed: 314_204, captureEvents: true },
    ]);
    expect(first.eventCount).toBe(7);
    expect(first.failures).toEqual([
      expect.objectContaining({
        decks: ["b", "a"],
        seed: 209_475,
        events: [
          expect.objectContaining({
            kind: "effectTriggered",
            sourceCardId: "BT1-009",
          }),
        ],
        presentationAnomalies: [expect.objectContaining({ kind: "effect-not-resolved" })],
      }),
    ]);
  });

  it("builds every seat through an injected policy factory with a per-seat seed", async () => {
    const runMatch = vi.fn<typeof runBotMatch>().mockResolvedValue(result());
    const created: { seat: number; seed: number }[] = [];
    const policy = createEvaluationPolicy();
    await runBattleFuzz({
      decks,
      maximumMatchups: 1,
      baseSeed: 40,
      runMatch,
      createSeatPolicy: ({ seat, seed }) => {
        created.push({ seat, seed });
        return policy;
      },
    });
    const seats = runMatch.mock.calls[0]![0].seats;
    expect(seats.map((seat) => seat.profile)).toEqual([undefined, undefined]);
    expect(seats.map((seat) => seat.policyFactory?.({} as GameEngine, 0, undefined))).toEqual([policy, policy]);
    expect(seats[1]!.policyFactory?.({} as GameEngine, 1, undefined)).toBe(policy);
    expect(created).toEqual([
      { seat: 0, seed: 40 },
      { seat: 0, seed: 40 },
      { seat: 1, seed: 7_959 },
    ]);
  });
});
