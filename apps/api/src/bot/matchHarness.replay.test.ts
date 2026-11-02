import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { GameState } from "@aegis/shared/schema/GameState";
import type { Seat } from "@aegis/shared/schema/enums";
import type { GameEngine } from "#api/engine/GameEngine";
import { runBotMatch, type SeatConfig } from "#api/bot/matchHarness";
import { createTrainingPolicy } from "#api/bot/training/policy";
import { mainActionReady } from "#api/bot/training/actions";
import { chooseHeuristic, SEED_HEURISTIC } from "#api/bot/evolution/heuristic";
import { validEvolutionGame } from "#api/bot/evolution/evolutionMatch";
import { randomDeck } from "#api/bot/evolution/randomDecks";
import { runReplay } from "#api/replays/inputs/run";
import { comparableState } from "#api/replays/inputs/roomMatch.fixture";

function hashEngineState(engine: GameEngine, state: GameState): string {
  engine.syncCounts();
  const { stateVersion: _roomBatchCount, ...engineState } = comparableState(state) as Record<string, unknown>;
  return createHash("sha256").update(JSON.stringify(engineState)).digest("hex");
}

async function playRecordedMatch(firstSeat: Seat | undefined) {
  let live: GameEngine | undefined;
  const seats = ([0, 1] as const).map((seat): SeatConfig => ({
    deck: randomDeck(seat + 1).deck,
    canChooseMainAction: mainActionReady,
    maxMainPhaseActions: Number.POSITIVE_INFINITY,
    policyFactory: (engine) => {
      live = engine;
      return createTrainingPolicy(engine, seat, (window) => chooseHeuristic(SEED_HEURISTIC, window, 42 + seat));
    },
  }));
  const result = await runBotMatch({
    seed: 42,
    ...(firstSeat === undefined ? {} : { firstSeat }),
    seats: [seats[0]!, seats[1]!],
    recordReplay: true,
    measureDecisionLatencies: false,
  });
  return { result, live: live! };
}

describe("bot match replay recording", () => {
  for (const firstSeat of [undefined, 1] as const) {
    it(`reproduces the played match exactly when the first seat is ${firstSeat ?? "seeded"}`, async () => {
      const { result, live } = await playRecordedMatch(firstSeat);
      expect(validEvolutionGame(result)).toBe(true);
      const record = result.replay!;
      expect(record.seats.every((seat) => seat.bot)).toBe(true);
      expect(record.firstSeat).toBe(firstSeat);
      expect(record.inputs.filter((input) => input.kind === "intent").length).toBeGreaterThan(10);

      const replay = await runReplay(JSON.parse(JSON.stringify(record)));

      expect(replay.divergences).toEqual([]);
      expect(replay.applied).toBe(record.inputs.length);
      expect(replay.state.gameOver).toBe(true);
      expect(replay.state.turnCount).toBe(result.turnCount);
      expect(replay.state.winnerSeat).toBe(result.winnerSeat ?? -1);
      expect(hashEngineState(replay.engine, replay.state)).toBe(hashEngineState(live, live.state));
    }, 60_000);
  }

  it("leaves the record out unless it is requested", async () => {
    const result = await runBotMatch({ seed: 42, seats: [{}, {}], turnLimit: 1 });
    expect(result).not.toHaveProperty("replay");
  });
});
