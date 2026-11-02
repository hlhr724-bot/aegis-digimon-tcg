import { expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { setupEngine } from "#api/engine/testkit/harness";
import { cardSourceOf, effectEnvironment } from "#api/engine/gameEngine/effectContext";
import { buildResolutionEnv } from "#api/engine/effects/resolution";
import { resolveTiming } from "#api/engine/effects/stack";
import { runControlFlowAction } from "#api/engine/effects/interpreter/actions/controlFlow";
import { InterpreterCallbackKind } from "#api/engine/effects/interpreter/snapshot/InterpreterCallbackKind";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";
import type { CollectedEffect } from "#api/engine/effects/collect";

it("tracks the resolution-time context and its delayed callbacks through the normal composition root", async () => {
  const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const collected: CollectedEffect = {
    source: cardSourceOf(setup.engine, setup.inst("source")),
    effect: {
      effectKey: "arm-delayed-draw",
      description: "arm delayed draw",
      optional: false,
      isInherited: false,
      isSecurity: false,
      isLinked: false,
      maxPerTurn: 1,
      canTrigger: () => true,
      canActivate: () => true,
      resolve: async (context) => {
        await runControlFlowAction(context, {
          kind: "DelayedEffect",
          trigger: "nextEndOfOpponentTurn",
          effect: { kind: "Draw", controller: "mine", amount: 1 },
        });
      },
    },
  };
  const env = buildResolutionEnv(effectEnvironment(setup.engine, {}), {
    turnSeat: 0,
    listCandidateInstances: () => [],
    ruleProcess: async () => {},
    isGameOver: () => false,
    chooseOrder: async () => 0,
    askOptional: async () => true,
  });
  env.collect = () => [collected];
  await resolveTiming(EffectTiming.OnPlay, env);
  const delayed = setup.engine.subTriggers.subscriptionsFor("endOfTurn")[0]!;
  expect(setup.engine.runtimeObjects.describe(delayed.activationContext!)?.key).toBe(
    EngineRuntimeObjectKind.EFFECT_CONTEXT.value,
  );
  expect(setup.engine.runtimeCallbacks.describe(delayed.run).key).toBe(InterpreterCallbackKind.DELAYED_BODY.value);
  expect(setup.engine.runtimeCallbacks.describe(delayed.matches!).key).toBe(
    InterpreterCallbackKind.DELAYED_MATCH.value,
  );
  expect(delayed.activationContext?.game.runtimeObjects).toBe(setup.engine.runtimeObjects);
});
