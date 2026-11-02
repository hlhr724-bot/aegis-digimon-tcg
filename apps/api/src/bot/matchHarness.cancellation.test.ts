import { expect, it } from "vitest";
import { runBotMatch } from "#api/bot/matchHarness";
import { createTrainingPolicy } from "#api/bot/training/policy";
import { mainActionReady } from "#api/bot/training/actions";
import type { GameEngine } from "#api/engine/GameEngine";

it("does not dispatch the intent returned by a policy that cancelled the match", async () => {
  const controller = new AbortController();
  let stoppedState: string | undefined;
  let engineReference: GameEngine | undefined;
  const seat = {
    canChooseMainAction: mainActionReady,
    policyFactory: (engine: GameEngine, player: 0 | 1) => {
      engineReference = engine;
      return createTrainingPolicy(engine, player, () => {
        stoppedState ??= JSON.stringify(engine.state.toJSON());
        controller.abort();
        return 0;
      });
    },
  };
  const result = await runBotMatch({ seed: 719, seats: [seat, seat], signal: controller.signal });
  expect(result.reason).toBe("cancelled");
  expect(stoppedState).toBeDefined();
  expect(JSON.stringify(engineReference!.state.toJSON())).toBe(stoppedState);
  expect(result.errors).toEqual([]);
  expect(result.rejections).toEqual([]);
});
