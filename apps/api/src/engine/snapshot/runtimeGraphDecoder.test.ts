import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { EffectTiming } from "@aegis/shared/schema/enums";
import type { SubTriggerRegistryState } from "#api/engine/effects/SubTriggerRegistryState";
import { registerIrCard } from "#api/engine/effects/interpreter/registration/module";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter/compiledCards";
import { fireTimingForPermanent } from "#api/engine/gameEngine/timing/fire";
import { buildSubTriggerContext } from "#api/engine/gameEngine/subTriggers";
import { expect, it } from "vitest";
import { GameState } from "@aegis/shared/schema/GameState";
import type { CardInstance } from "@aegis/shared/schema/CardInstance";
import { GameEngine } from "#api/engine/GameEngine";
import type { EffectContext } from "#api/engine/effects/context/effectContext";
import { buildEffectContext, cardSourceOf } from "#api/engine/gameEngine/effectContext";
import { createResolutionCandidateReader } from "#api/engine/effects/resolution/createResolutionCandidateReader";
import { ResolutionCandidateKind } from "#api/engine/effects/resolution/ResolutionCandidateKind";
import { RuntimeGraphDecoder } from "#api/engine/snapshot/RuntimeGraphDecoder";
import { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { RuntimeCallbackRegistry } from "#api/engine/snapshot/RuntimeCallbackRegistry";
import { registerEngineSchemaFactories } from "#api/engine/snapshot/schema/registerEngineSchemaFactories";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { setupEngine } from "#api/engine/testkit/harness";

it("decodes state before engine construction and preserves aliases when binding destination runtime ports", async () => {
  const original = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }], deck: ["BT1-019"] } });
  const source = original.inst("source");
  const permanent = original.perm("source");
  const context = buildEffectContext(original.engine, cardSourceOf(original.engine, source), {
    playedSubject: permanent,
  });
  const reader = createResolutionCandidateReader({
    engine: original.engine,
    permanent,
    scope: {
      kind: ResolutionCandidateKind.PERMANENT.value,
      permanentId: permanent.permanentId,
      instanceIds: [source.instanceId],
      resident: true,
    },
  });
  const snapshot = encodeRuntimeGraph({
    value: { state: original.state, context, reader, source },
    describeObject: original.engine.runtimeObjects.describe.bind(original.engine.runtimeObjects),
    describeCallback: original.engine.runtimeCallbacks.describe.bind(original.engine.runtimeCallbacks),
    references: original.engine.runtimeReferences,
  });
  const objects = new RuntimeObjectRegistry();
  registerEngineSchemaFactories({ objects });
  const decoder = new RuntimeGraphDecoder({ snapshot: JSON.parse(JSON.stringify(snapshot)), objects });
  const state = decoder.decodeRootField({ key: "state" }) as GameState;
  expect(state).toBeInstanceOf(GameState);
  const destination = new GameEngine(state, {
    seed: 1,
    emit: () => {},
    requestDecision: () => {
      throw new Error("Unexpected decision");
    },
  });
  decoder.bindRuntimePorts({
    objects: destination.runtimeObjects,
    createCallback: destination.runtimeCallbacks.create.bind(destination.runtimeCallbacks),
    references: destination.runtimeReferences,
  });
  const restored = decoder.decodeRoot() as {
    state: GameState;
    context: EffectContext;
    reader: () => readonly CardInstance[];
    source: CardInstance;
  };
  expect(restored.state).toBe(state);
  expect(restored.context.game.state).toBe(state);
  expect(restored.context.source.permanent()).toBe(state.players[0]!.battleArea[0]);
  expect(restored.context.trigger.playedSubject).toBe(state.players[0]!.battleArea[0]);
  expect(restored.source).toBe(state.players[0]!.battleArea[0]!.topCard);
  expect(restored.reader()[0]).toBe(restored.source);
  expect(decoder.decodeRoot()).toBe(restored);
  expect(decoder.decodeRootField({ key: "state" })).toBe(state);
  await restored.context.fx.draw(0, 1);
  expect(state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-019"]);
  expect(original.state.players[0]!.hand).toHaveLength(0);
});

it("does not reuse a partially hydrated resource after a decoding failure", () => {
  const original = new RuntimeObjectRegistry();
  const source = {};
  original.registerFactory({ key: "value", allocate: () => ({}), describe: () => ({ count: 4 }), hydrate: () => {} });
  original.track({ value: source, key: "value" });
  const snapshot = encodeRuntimeGraph({ value: { source }, describeObject: original.describe.bind(original) });
  const destination = new RuntimeObjectRegistry();
  destination.registerFactory({
    key: "value",
    allocate: () => ({}),
    describe: () => ({}),
    hydrate: () => {
      throw new Error("injected-hydration-failure");
    },
  });
  const decoder = new RuntimeGraphDecoder({ snapshot, objects: destination });
  expect(() => decoder.decodeRootField({ key: "source" })).toThrow("injected-hydration-failure");
  expect(() => decoder.decodeRoot()).toThrow("failed");
  expect(() => decoder.bindRuntimePorts({ objects: original })).toThrow("cannot be rebound");
});

it("rejects rebinding after callback reconstruction and rejects repeated port binding", () => {
  const callbacks = new RuntimeCallbackRegistry();
  callbacks.registerFactory({ key: "value", create: () => () => 4 });
  const callback = callbacks.create({ key: "value", payload: null });
  const snapshot = encodeRuntimeGraph({ value: { callback }, describeCallback: callbacks.describe.bind(callbacks) });
  const active = new RuntimeGraphDecoder({ snapshot, createCallback: callbacks.create.bind(callbacks) });
  expect(active.decodeRootField({ key: "callback" })).toBeTypeOf("function");
  expect(() => active.bindRuntimePorts({})).toThrow("cannot be rebound");
  const staged = new RuntimeGraphDecoder({ snapshot });
  staged.bindRuntimePorts({ createCallback: callbacks.create.bind(callbacks) });
  expect(() => staged.bindRuntimePorts({})).toThrow("cannot be rebound");
  expect(staged.decodeRoot()).toHaveProperty("callback");
});

it("rejects missing root fields instead of starting a partial decode under a different shape", () => {
  const decoder = new RuntimeGraphDecoder({ snapshot: encodeRuntimeGraph({ value: { state: {} } }) });
  expect(() => decoder.decodeRootField({ key: "unknown" })).toThrow("missing");
  expect(() => decoder.decodeRoot()).toThrow("failed");
});

it("restores a production delayed subscription and its historical source in one graph with game state", async () => {
  const cardId = "BT1-009";
  const originalProgram = runtimeCompiledCard(cardId)!;
  const program: CompiledCard = {
    coverage: "full",
    residual: [],
    effects: [
      {
        trigger: "OnPlay",
        actions: [
          {
            kind: "DelayedEffect",
            trigger: "nextEndOfOpponentTurn",
            effect: { kind: "Draw", controller: "mine", amount: 1 },
          },
        ],
      },
    ],
  };
  try {
    registerIrCard(cardId, program);
    const original = setupEngine({ 0: { battleArea: [{ card: cardId, as: "source" }], deck: ["BT1-019"] } });
    const historical = original.perm("source");
    await fireTimingForPermanent(original.engine, EffectTiming.OnPlay, historical, { playedSubject: historical });
    original.state.players[0]!.battleArea.splice(0, 1);
    original.state.players[0]!.trash.push(historical.topCard);
    const snapshot = encodeRuntimeGraph({
      value: { state: original.state, subTriggers: original.engine.subTriggers.getRuntimeState(), historical },
      describeObject: original.engine.runtimeObjects.describe.bind(original.engine.runtimeObjects),
      describeCallback: original.engine.runtimeCallbacks.describe.bind(original.engine.runtimeCallbacks),
      references: original.engine.runtimeReferences,
    });
    const objects = new RuntimeObjectRegistry();
    registerEngineSchemaFactories({ objects });
    const decoder = new RuntimeGraphDecoder({ snapshot: JSON.parse(JSON.stringify(snapshot)), objects });
    const state = decoder.decodeRootField({ key: "state" }) as GameState;
    const destination = new GameEngine(state, {
      seed: 1,
      emit: () => {},
      requestDecision: () => {
        throw new Error("Unexpected decision");
      },
    });
    decoder.bindRuntimePorts({
      objects: destination.runtimeObjects,
      createCallback: destination.runtimeCallbacks.create.bind(destination.runtimeCallbacks),
      references: destination.runtimeReferences,
    });
    const restored = decoder.decodeRoot() as {
      state: GameState;
      subTriggers: SubTriggerRegistryState;
      historical: typeof historical;
    };
    destination.subTriggers.restoreRuntimeState(restored.subTriggers);
    const subscription = destination.subTriggers.subscriptionsFor("endOfTurn")[0]!;
    const context = subscription.activationContext!;
    expect(context.game.state).toBe(state);
    expect(context.trigger.playedSubject).toBe(restored.historical);
    expect(restored.historical.topCard).toBe(state.players[0]!.trash[0]);
    expect(context.source.permanent()).toBeUndefined();
    await context.drainCurrentTimingWindow!();
    expect(destination.subTriggers.subscriptionsFor("endOfTurn")).toHaveLength(1);
    state.turnSeat = 1;
    expect(await destination.subTriggers.fire("endOfTurn", (sub) => buildSubTriggerContext(destination, sub, {}))).toBe(
      1,
    );
    expect(state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-019"]);
    expect(original.state.players[0]!.hand).toHaveLength(0);
    expect(original.engine.subTriggers.subscriptionsFor("endOfTurn")).toHaveLength(1);
  } finally {
    registerIrCard(cardId, originalProgram);
  }
});
