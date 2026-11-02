import type { CardInstance } from "@aegis/shared/schema/CardInstance";
import { resolveTiming } from "#api/engine/effects/stack";
import { buildResolutionEnv } from "#api/engine/effects/resolution";
import type { TimingWindowRuntime } from "#api/engine/effects/resolution/TimingWindowRuntime";
import type { TimingWindowState } from "#api/engine/effects/resolution/TimingWindowState";
import { effectEnvironment } from "#api/engine/gameEngine/effectContext";
import { runAction } from "#api/engine/effects/interpreter/dispatch";
import type { EffectContext } from "#api/engine/effects/context/effectContext";
import { expect, it } from "vitest";
import "#api/cards/index";
import { EffectTiming } from "@aegis/shared/schema/enums";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Effect } from "#api/engine/effects/Effect";
import type { CardSource } from "#api/engine/effects/CardSource";
import { registerIrCard } from "#api/engine/effects/interpreter/registration/module";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter/compiledCards";
import { getEffectModule } from "#api/engine/effects/registry";
import { setupEngine } from "#api/engine/testkit/harness";
import { buildEffectContext, cardSourceOf } from "#api/engine/gameEngine/effectContext";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";

const CARD_ID = "BT1-009";
const PROGRAM: CompiledCard = {
  coverage: "full",
  residual: [],
  effects: [{ trigger: "OnPlay", actions: [{ kind: "Draw", controller: "mine", amount: 1 }] }],
};

it("rebuilds printed IR handlers with destination sources and retains runtime attributes", async () => {
  const originalProgram = runtimeCompiledCard(CARD_ID)!;
  try {
    registerIrCard(CARD_ID, structuredClone(PROGRAM));
    const original = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "source" }], deck: ["BT1-010"] } });
    const destination = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "source" }], deck: ["BT1-019"] } });
    const destinationPermanent = destination.perm("source");
    destination.inst("source").instanceId = original.inst("source").instanceId;
    destinationPermanent.permanentId = original.perm("source").permanentId;
    const source = cardSourceOf(original.engine, original.inst("source"));
    const effect = getEffectModule(CARD_ID)!.effectsForTiming(EffectTiming.OnPlay, source)[0]!;
    effect.description = "retained description";
    expect(effect.irTrigger).toBe("OnPlay");
    delete effect.irTrigger;
    const snapshot = encodeRuntimeGraph({
      value: { effect, source },
      describeObject: original.engine.runtimeObjects.describe.bind(original.engine.runtimeObjects),
      references: original.engine.runtimeReferences,
    });
    const restored = decodeRuntimeGraph({
      snapshot: JSON.parse(JSON.stringify(snapshot)),
      objects: destination.engine.runtimeObjects,
      references: destination.engine.runtimeReferences,
    }) as { effect: Effect; source: CardSource };
    expect(restored.effect.resolve).not.toBe(effect.resolve);
    expect(restored.effect.description).toBe("retained description");
    expect(Object.hasOwn(restored.effect, "irTrigger")).toBe(false);
    expect(restored.effect.effectKey).toBe(effect.effectKey);
    expect(restored.source.permanent()).toBe(destinationPermanent);
    await restored.effect.resolve(buildEffectContext(destination.engine, restored.source, {}));
    expect(destination.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-019"]);
    expect(original.state.players[0]!.hand).toHaveLength(0);
    expect(() =>
      encodeRuntimeGraph({
        value: restored.effect,
        describeObject: destination.engine.runtimeObjects.describe.bind(destination.engine.runtimeObjects),
        references: destination.engine.runtimeReferences,
      }),
    ).not.toThrow();
  } finally {
    registerIrCard(CARD_ID, originalProgram);
  }
});

it("refuses changed handlers and refuses definition copies that lost canonical identity", () => {
  const originalProgram = runtimeCompiledCard(CARD_ID)!;
  try {
    registerIrCard(CARD_ID, structuredClone(PROGRAM));
    const setup = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "source" }] } });
    const source = cardSourceOf(setup.engine, setup.inst("source"));
    const effect = getEffectModule(CARD_ID)!.effectsForTiming(EffectTiming.OnPlay, source)[0]!;
    const snapshot = encodeRuntimeGraph({
      value: effect,
      describeObject: setup.engine.runtimeObjects.describe.bind(setup.engine.runtimeObjects),
    });
    expect(() => decodeRuntimeGraph({ snapshot, objects: setup.engine.runtimeObjects })).toThrow(
      "does not match installed IR",
    );
    effect.resolve = async () => {};
    expect(() =>
      encodeRuntimeGraph({
        value: effect,
        describeObject: setup.engine.runtimeObjects.describe.bind(setup.engine.runtimeObjects),
        references: setup.engine.runtimeReferences,
      }),
    ).toThrow("specialized callback");
  } finally {
    registerIrCard(CARD_ID, originalProgram);
  }
});

it("keeps a declined action bound to the installed IR after rebuilding its module", async () => {
  const originalProgram = runtimeCompiledCard(CARD_ID)!;
  try {
    const program = structuredClone(PROGRAM);
    program.effects[0]!.actions[0]!.optional = true;
    registerIrCard(CARD_ID, program);
    const action = runtimeCompiledCard(CARD_ID)!.effects[0]!.actions[0]!;
    expect(action.optional).toBe(true);
    const original = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "source" }] } });
    const destination = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "source" }], deck: ["BT1-019"] } });
    const destinationPermanent = destination.perm("source");
    destination.inst("source").instanceId = original.inst("source").instanceId;
    destinationPermanent.permanentId = original.perm("source").permanentId;
    const context = buildEffectContext(original.engine, cardSourceOf(original.engine, original.inst("source")), {});
    context.predecidedOptionalActions = new Map([[action, false]]);
    const snapshot = encodeRuntimeGraph({
      value: context,
      describeObject: original.engine.runtimeObjects.describe.bind(original.engine.runtimeObjects),
      references: original.engine.runtimeReferences,
    });
    registerIrCard(CARD_ID, structuredClone(program));
    const currentAction = runtimeCompiledCard(CARD_ID)!.effects[0]!.actions[0]!;
    expect(currentAction).not.toBe(action);
    const restored = decodeRuntimeGraph({
      snapshot: JSON.parse(JSON.stringify(snapshot)),
      objects: destination.engine.runtimeObjects,
      references: destination.engine.runtimeReferences,
    }) as EffectContext;
    expect(restored.predecidedOptionalActions?.get(currentAction)).toBe(false);
    await runAction(restored, currentAction);
    expect(destination.state.players[0]!.hand).toHaveLength(0);
    expect(destination.decisions).toHaveLength(0);
  } finally {
    registerIrCard(CARD_ID, originalProgram);
  }
});

it("restores a closed window with collected printed effects without resolving retired entries again", async () => {
  const originalProgram = runtimeCompiledCard(CARD_ID)!;
  try {
    registerIrCard(CARD_ID, structuredClone(PROGRAM));
    const original = setupEngine({
      0: { battleArea: [{ card: CARD_ID, as: "source" }], deck: ["BT1-010", "BT1-019"] },
    });
    const destination = setupEngine({
      0: { battleArea: [{ card: CARD_ID, as: "source" }], hand: ["BT1-010"], deck: ["BT1-019"] },
    });
    const destinationPermanent = destination.perm("source");
    const destinationCard = destination.inst("source");
    destinationCard.instanceId = original.inst("source").instanceId;
    destinationPermanent.permanentId = original.perm("source").permanentId;
    let runtime: TimingWindowRuntime | undefined;
    function environment({ setup, source }: { setup: ReturnType<typeof setupEngine>; source: CardInstance }) {
      return buildResolutionEnv(effectEnvironment(setup.engine, {}), {
        turnSeat: 0,
        listCandidateInstances: () => [source],
        ruleProcess: async () => {},
        isGameOver: () => false,
        chooseOrder: async () => 0,
        askOptional: async () => true,
      });
    }
    const env = environment({ setup: original, source: original.inst("source") });
    env.onTimingWindowCreated = (created) => {
      runtime = created;
    };
    await resolveTiming(EffectTiming.OnPlay, env);
    expect(original.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-010"]);
    expect(runtime!.state.lastCollected).toHaveLength(1);
    expect(runtime!.state.resolved.size).toBe(1);
    const snapshot = encodeRuntimeGraph({
      value: runtime!.state,
      describeObject: original.engine.runtimeObjects.describe.bind(original.engine.runtimeObjects),
      references: original.engine.runtimeReferences,
    });
    registerIrCard(CARD_ID, structuredClone(PROGRAM));
    const restored = decodeRuntimeGraph({
      snapshot: JSON.parse(JSON.stringify(snapshot)),
      objects: destination.engine.runtimeObjects,
      references: destination.engine.runtimeReferences,
    }) as TimingWindowState;
    expect(restored.lastCollected).toHaveLength(1);
    expect(restored.lastCollected[0]!.source.permanent()).toBe(destinationPermanent);
    expect(restored.lastCollected[0]!.effect.resolve).not.toBe(runtime!.state.lastCollected[0]!.effect.resolve);
    await runtime!.drain();
    await resolveTiming(EffectTiming.OnPlay, environment({ setup: destination, source: destinationCard }), {
      state: restored,
    });
    expect(destination.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-010"]);
    expect(destination.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT1-019"]);
    expect(restored.passes).toBe(runtime!.state.passes);
    expect(restored.resolved).toEqual(runtime!.state.resolved);
  } finally {
    registerIrCard(CARD_ID, originalProgram);
  }
});
