import { expect, it } from "vitest";
import { EffectDuration } from "@aegis/shared/schema/enums";
import { GameState } from "@aegis/shared/schema/GameState";
import type { Primitives } from "#api/engine/effects/EffectContext";
import type { EffectContext } from "#api/engine/effects/context/effectContext";
import { GameEngine } from "#api/engine/GameEngine";
import { setupEngine } from "#api/engine/testkit/harness";
import { buildEffectContext, cardSourceOf } from "#api/engine/gameEngine/effectContext";
import { createScopedEffectPrimitives } from "#api/engine/effects/scopes/createScopedEffectPrimitives";
import { ScopedPrimitiveKind } from "#api/engine/effects/scopes/ScopedPrimitiveKind";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";
import { RuntimeGraphDecoder } from "#api/engine/snapshot/RuntimeGraphDecoder";
import { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { registerEngineSchemaFactories } from "#api/engine/snapshot/schema/registerEngineSchemaFactories";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { createNoPromptDecisionApi } from "#api/engine/decisions/createNoPromptDecisionApi";

it.each(Object.values(ScopedPrimitiveKind))(
  "restores $name primitive scope against destination ledgers",
  async ({ value: kind }) => {
    const original = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
    const context = buildEffectContext(
      original.engine,
      cardSourceOf(original.engine, original.inst("source")),
      {},
      createNoPromptDecisionApi(),
    );
    const fx = createScopedEffectPrimitives({ ctx: context, kind, maxPerTurn: 1, autoKey: "shared-use-key" });
    const scopedContext = { ...context, fx };
    original.engine.runtimeObjects.track({ value: scopedContext, key: EngineRuntimeObjectKind.EFFECT_CONTEXT.value });
    const snapshot = encodeRuntimeGraph({
      value: { state: original.state, context: scopedContext, fx },
      references: original.engine.runtimeReferences,
      describeObject: (value) => original.engine.runtimeObjects.describe(value),
      describeCallback: (callback) => original.engine.runtimeCallbacks.describe(callback),
    });
    const objects = new RuntimeObjectRegistry();
    registerEngineSchemaFactories({ objects });
    const decoder = new RuntimeGraphDecoder({ snapshot: JSON.parse(JSON.stringify(snapshot)), objects });
    const state = decoder.decodeRootField({ key: "state" });
    expect(state).toBeInstanceOf(GameState);
    const destination = new GameEngine(state as GameState, {
      seed: 1,
      emit: () => {},
      requestDecision: () => {
        throw new Error("A passive scope must not prompt");
      },
    });
    decoder.bindRuntimePorts({
      objects: destination.runtimeObjects,
      references: destination.runtimeReferences,
      createCallback: (descriptor) => destination.runtimeCallbacks.create(descriptor),
    });
    const restored = decoder.decodeRoot() as { context: EffectContext; fx: Primitives };
    expect(restored.context.fx).toBe(restored.fx);
    expect(restored.context.game.state).toBe(destination.state);
    expect(await restored.context.ask.optional(restored.context, "Passive scope")).toBe(false);
    expect(await restored.context.ask.chooseOption(restored.context, ["A", "B"])).toBe(0);
    const permanentId = original.perm("source").permanentId;
    if (kind === ScopedPrimitiveKind.EVOLUTION_COST.value) {
      restored.fx.changeEvoCost(() => true, -1);
    } else {
      restored.fx.modifyDP(permanentId, -1000, EffectDuration.Permanent);
    }
    if (kind === ScopedPrimitiveKind.STATIC.value) {
      restored.fx.subscribeSubTrigger({
        event: "whenPlayed",
        sourcePermanentId: permanentId,
        once: false,
        description: "Scoped watcher",
        run: async () => {},
      });
    }
    const originalModifiers = original.engine.modifiers.getRuntimeState();
    const modifiers = destination.modifiers.getRuntimeState();
    expect(originalModifiers.evoCostAdjustments).toHaveLength(0);
    expect(originalModifiers.dpModifiers).toHaveLength(0);
    expect(modifiers.evoCostAdjustments.map((entry) => entry.continuous)).toEqual(
      kind === ScopedPrimitiveKind.EVOLUTION_COST.value ? [true] : [],
    );
    expect(modifiers.dpModifiers.map((entry) => entry.continuous)).toEqual(
      kind === ScopedPrimitiveKind.EVOLUTION_COST.value ? [] : [true],
    );
    expect(
      destination.subTriggers
        .subscriptionsFor("whenPlayed")
        .map((subscription) => ({ continuous: subscription.continuous, key: subscription.oncePerTurnKey })),
    ).toEqual(kind === ScopedPrimitiveKind.STATIC.value ? [{ continuous: true, key: "shared-use-key" }] : []);
  },
);

it("rejects a scoped primitive whose installed methods have been replaced", () => {
  const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const context = buildEffectContext(setup.engine, cardSourceOf(setup.engine, setup.inst("source")), {});
  const fx = createScopedEffectPrimitives({ ctx: context, kind: ScopedPrimitiveKind.STATIC.value, autoKey: "scope" });
  fx.modifyDP = () => {};
  expect(() =>
    encodeRuntimeGraph({ value: fx, describeObject: (value) => setup.engine.runtimeObjects.describe(value) }),
  ).toThrow("modified scoped primitives");
});
