import { expect, it } from "vitest";
import { runControlFlowAction } from "#api/engine/effects/interpreter/actions/controlFlow";
import { buildEffectContext, cardSourceOf } from "#api/engine/gameEngine/effectContext";
import { InterpreterCallbackKind } from "#api/engine/effects/interpreter/snapshot/InterpreterCallbackKind";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";
import type { SubTriggerSubscription } from "#api/engine/effects/subtriggers";
import { setupEngine } from "#api/engine/testkit/harness";

it("describes real delayed IR callbacks and runs restored bodies using the destination context", async () => {
  const original = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const destination = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const originalContext = buildEffectContext(
    original.engine,
    cardSourceOf(original.engine, original.inst("source")),
    {},
  );
  originalContext.namedCounts = new Map([["armed", 3]]);
  original.state.memory = 2;
  destination.state.memory = 4;
  await runControlFlowAction(originalContext, {
    kind: "DelayedEffect",
    trigger: "nextEndOfOpponentTurn",
    effect: { kind: "GainMemory", amount: 1 },
  });
  const subscription = original.engine.subTriggers.subscriptionsFor("endOfTurn")[0]!;
  expect(original.engine.runtimeCallbacks.describe(subscription.run).key).toBe(
    InterpreterCallbackKind.DELAYED_BODY.value,
  );
  expect(original.engine.runtimeCallbacks.describe(subscription.matches!).key).toBe(
    InterpreterCallbackKind.DELAYED_MATCH.value,
  );
  originalContext.namedCounts.set("armed", 9);
  const snapshot = encodeRuntimeGraph({
    value: { run: subscription.run, matches: subscription.matches },
    describeCallback: original.engine.runtimeCallbacks.describe.bind(original.engine.runtimeCallbacks),
  });
  const restored = decodeRuntimeGraph({
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    createCallback: destination.engine.runtimeCallbacks.create.bind(destination.engine.runtimeCallbacks),
  }) as Pick<SubTriggerSubscription, "run" | "matches">;
  const context = buildEffectContext(
    destination.engine,
    cardSourceOf(destination.engine, destination.inst("source")),
    {},
  );
  destination.state.turnSeat = 1;
  expect(restored.matches!(context)).toBe(true);
  destination.state.turnSeat = 0;
  expect(restored.matches!(context)).toBe(false);
  await restored.run(context);
  expect(context.namedCounts?.get("armed")).toBe(3);
  expect(destination.state.memory).toBe(5);
  expect(original.state.memory).toBe(2);
  expect(originalContext.namedCounts.get("armed")).toBe(9);
});
