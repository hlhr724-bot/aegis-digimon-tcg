import { describe, expect, it } from "vitest";
import type { Seat, ServerEvent } from "@aegis/shared";
import type { GameEngine } from "#api/engine/GameEngine";
import { runBotMatch } from "#api/bot/matchHarness";
import { createTrainingPolicy } from "#api/bot/training/policy";
import { mainActionReady } from "#api/bot/training/actions";
import { chooseHeuristic, SEED_HEURISTIC } from "#api/bot/evolution/heuristic";
import { informationKey } from "#api/bot/evolution/mcts";
import { validEvolutionGame } from "#api/bot/evolution/evolutionMatch";
import { randomDeck } from "#api/bot/evolution/randomDecks";

describe("match rollout event capture", () => {
  it("filters retained events while preserving policy history, health and outcomes", async () => {
    const run = async (filtered: boolean) => {
      const windows: string[][] = [[], []];
      const observed: string[][] = [[], []];
      const seats = ([0, 1] as const).map((seat) => ({
        deck: randomDeck(seat + 1).deck,
        canChooseMainAction: mainActionReady,
        maxMainPhaseActions: Number.POSITIVE_INFINITY,
        policyFactory: (engine: GameEngine) => {
          const policy = createTrainingPolicy(engine, seat, (window) => {
            windows[seat]!.push(informationKey(window));
            return chooseHeuristic(SEED_HEURISTIC, window, 42 + seat * 7919);
          });
          return {
            ...policy,
            observeEvent: (event: ServerEvent) => {
              observed[seat]!.push(event.kind);
              policy.observeEvent?.(event);
            },
          };
        },
      }));
      const result = await runBotMatch({
        seed: 42,
        seats: [seats[0]!, seats[1]!],
        captureEvents: true,
        verifyProjections: true,
        ...(filtered
          ? {
              captureEventFilter: (event: ServerEvent) => event.kind === "actionRejected",
              measureDecisionLatencies: false,
            }
          : {}),
      });
      return { result, windows, observed };
    };
    const reference = await run(false);
    const filtered = await run(true);
    expect(validEvolutionGame(reference.result)).toBe(true);
    expect(validEvolutionGame(filtered.result)).toBe(true);
    expect(filtered.windows).toEqual(reference.windows);
    expect(filtered.observed).toEqual(reference.observed);
    expect(reference.result.events!.length).toBeGreaterThan(0);
    expect(filtered.result.events).toEqual(reference.result.events!.filter((event) => event.kind === "actionRejected"));
    expect(filtered.result.seats.every((seat) => seat.decisionLatenciesMs.length === 0)).toBe(true);
    expect(reference.result.seats.some((seat) => seat.decisionLatenciesMs.length > 0)).toBe(true);
    const stableResult = (result: typeof reference.result) => ({
      ...result,
      events: undefined,
      seats: result.seats.map(({ decisionLatenciesMs: _decisionLatenciesMs, ...stats }) => stats),
    });
    expect(stableResult(filtered.result)).toEqual(stableResult(reference.result));
  });

  it("retains asynchronous rejection evidence even when no intent returns a refusal", async () => {
    let emitted = false;
    const seats = ([0, 1] as const).map((seat) => ({
      deck: randomDeck(seat + 1).deck,
      canChooseMainAction: mainActionReady,
      maxMainPhaseActions: Number.POSITIVE_INFINITY,
      policyFactory: (engine: GameEngine, policySeat: Seat) =>
        createTrainingPolicy(engine, policySeat, (window) => {
          if (!emitted && policySeat === 0 && window.kind === "main") {
            emitted = true;
            engine.hooks.emit({ kind: "actionRejected", intent: "playCard", reason: "insufficient-memory" });
          }
          return chooseHeuristic(SEED_HEURISTIC, window, 42 + policySeat * 7919);
        }),
    }));
    const result = await runBotMatch({
      seed: 42,
      seats: [seats[0]!, seats[1]!],
      captureEvents: true,
      captureEventFilter: (event) => event.kind === "actionRejected",
      measureDecisionLatencies: false,
    });
    expect(emitted).toBe(true);
    expect(result.rejections).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.events).toEqual([{ kind: "actionRejected", intent: "playCard", reason: "insufficient-memory" }]);
    expect(validEvolutionGame(result)).toBe(false);
  });
});
