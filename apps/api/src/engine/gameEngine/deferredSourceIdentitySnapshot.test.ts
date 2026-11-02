import { expect, it } from "vitest";
import "#api/cards/index";
import { CardInstance } from "@aegis/shared/schema/CardInstance";
import type { GameState } from "@aegis/shared/schema/GameState";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { GameEngine } from "#api/engine/GameEngine";
import type { CollectedEffect } from "#api/engine/effects/collect";
import { registerIrCard } from "#api/engine/effects/interpreter/registration/module";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter/compiledCards";
import { deferNestedTimingEffects } from "#api/engine/gameEngine/windows";
import { nestedTriggerSourceStillResident } from "#api/engine/gameEngine/subTriggers";
import { setupEngine } from "#api/engine/testkit/harness";
import { RuntimeGraphDecoder } from "#api/engine/snapshot/RuntimeGraphDecoder";
import { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { registerEngineSchemaFactories } from "#api/engine/snapshot/schema/registerEngineSchemaFactories";

it("retains a deferred source's original role after JSON restoration and a later evolution", () => {
  const cardId = "BT1-009";
  const saved = runtimeCompiledCard(cardId)!;
  try {
    registerIrCard(cardId, {
      coverage: "full",
      residual: [],
      effects: [{ trigger: "OnPlay", actions: [{ kind: "Draw", controller: "mine", amount: 1 }] }],
    });
    const original = setupEngine({ 0: { battleArea: [{ card: cardId, as: "source" }] } });
    deferNestedTimingEffects(original.engine, EffectTiming.OnPlay, {}, [original.inst("source")]);
    const pending = original.engine.pendingNestedTimingEffects;
    expect(pending).toHaveLength(1);
    expect(pending[0]!.sourceIdentityAtDefer).toBeTypeOf("string");
    const snapshot = encodeRuntimeGraph({
      value: { state: original.state, pending },
      describeObject: original.engine.runtimeObjects.describe.bind(original.engine.runtimeObjects),
      describeCallback: original.engine.runtimeCallbacks.describe.bind(original.engine.runtimeCallbacks),
      references: original.engine.runtimeReferences,
    });
    const objects = new RuntimeObjectRegistry();
    registerEngineSchemaFactories({ objects });
    const decoder = new RuntimeGraphDecoder({ snapshot: JSON.parse(JSON.stringify(snapshot)), objects });
    const state = decoder.decodeRootField({ key: "state" }) as GameState;
    const destination = new GameEngine(state, { seed: 1, emit: () => {}, requestDecision: () => {} });
    decoder.bindRuntimePorts({
      objects: destination.runtimeObjects,
      createCallback: destination.runtimeCallbacks.create.bind(destination.runtimeCallbacks),
      references: destination.runtimeReferences,
    });
    const restored = decoder.decodeRoot() as { pending: CollectedEffect[] };
    expect(restored.pending[0]!.sourceIdentityAtDefer).toBe(pending[0]!.sourceIdentityAtDefer);
    expect(nestedTriggerSourceStillResident(destination, restored.pending[0]!)).toBe(true);
    const permanent = state.players[0]!.battleArea[0]!;
    const next = new CardInstance();
    next.instanceId = "new-top";
    next.cardId = "BT1-010";
    next.ownerSeat = 0;
    permanent.stack.push(permanent.topCard);
    permanent.topCard = next;
    expect(nestedTriggerSourceStillResident(destination, restored.pending[0]!)).toBe(false);
    expect(nestedTriggerSourceStillResident(original.engine, pending[0]!)).toBe(true);
  } finally {
    registerIrCard(cardId, saved);
  }
});
