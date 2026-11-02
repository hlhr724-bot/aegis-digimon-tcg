import { snapshotEngineRandom } from "#api/engine/random/snapshotEngineRandom";
import { restoreEngineRandom } from "#api/engine/random/restoreEngineRandom";
import { describe, expect, it, vi } from "vitest";
import { GameState } from "@aegis/shared/schema/GameState";
import { GameEngine } from "#api/engine/GameEngine";
import { makeRng, seatSeed, shuffleInPlace } from "#api/engine/setup";
import type { ScenarioFixture } from "#api/engine/scenario/types";

describe("scenario fixture random streams", () => {
  it.each([73, 101])(
    "initializes both seeded security streams before starting the turn loop (seed %i)",
    async (seed) => {
      const state = new GameState();
      const engine = new GameEngine(state, { seed, emit: vi.fn(), requestDecision: vi.fn() });
      for (const seat of [0, 1] as const) {
        engine.seatPlayer(seat, `seat-${seat}`, {
          displayName: `Player ${seat}`,
          deck: { mainDeck: [], eggDeck: [] },
        });
      }
      const security = ["BT1-009", "BT1-010", "BT1-019", "BT1-045"];
      const expectedRandom = [makeRng(seatSeed(seed, 0)), makeRng(seatSeed(seed, 1))];
      const fixture: ScenarioFixture = {
        memory: 3,
        turnSeat: 0,
        turnCount: 1,
        isFirstPlayersFirstTurn: true,
        board: { 0: { security }, 1: { security } },
      };
      const run = vi.spyOn(engine.turnMachine, "run").mockImplementation(async () => {
        for (const seat of [0, 1] as const) {
          const expected = shuffleInPlace([...security], expectedRandom[seat]!);
          engine.primitives.shuffleSecurity(seat);
          expect([...state.players[seat]!.security].map((card) => card.cardId)).toEqual(expected);
          const second = shuffleInPlace([...expected], expectedRandom[seat]!);
          engine.primitives.shuffleSecurity(seat);
          expect([...state.players[seat]!.security].map((card) => card.cardId)).toEqual(second);
        }
      });

      engine.startScenarioFixture(fixture);

      expect(run).toHaveBeenCalledOnce();
      await run.mock.results[0]!.value;
      expect(engine.rngForSeat).toBeDefined();
      for (const seat of [0, 1] as const) {
        expect(engine.rngForSeat!(seat)()).toBe(expectedRandom[seat]!());
      }
      const snapshots = snapshotEngineRandom({ engine });
      const expected = [engine.rngForSeat!(0)(), engine.rngForSeat!(1)()];
      restoreEngineRandom({ engine, snapshots });
      expect([engine.rngForSeat!(0)(), engine.rngForSeat!(1)()]).toEqual(expected);
      expect(snapshotEngineRandom({ engine })).not.toEqual(snapshots);
    },
  );
});
