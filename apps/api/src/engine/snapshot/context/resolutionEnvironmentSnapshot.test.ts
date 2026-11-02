import { Permanent } from "@aegis/shared/schema/Permanent";
import { getEffectModule } from "#api/engine/effects/registry";
import { cardSourceOf } from "#api/engine/gameEngine/effectContext";
import type { CollectedEffect } from "#api/engine/effects/collect";
import type { ResolutionDeps } from "#api/engine/effects/resolution";
import { fireTimingForInstance, fireTimingForPermanent } from "#api/engine/gameEngine/timing/fire";
import { expect, it } from "vitest";
import "#api/cards/index";
import { EffectTiming } from "@aegis/shared/schema/enums";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { ResolutionEnv } from "#api/engine/effects/stack";
import { resolveTiming } from "#api/engine/effects/stack";
import { buildResolutionEnv } from "#api/engine/effects/resolution";
import { resolutionDeps } from "#api/engine/gameEngine/actionDeps";
import { effectEnvironment } from "#api/engine/gameEngine/effectContext";
import { buildSubTriggerContext } from "#api/engine/gameEngine/subTriggers";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter/compiledCards";
import { registerIrCard } from "#api/engine/effects/interpreter/registration/module";
import { setupEngine } from "#api/engine/testkit/harness";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";

const CARD_ID = "BT1-009";
const PROGRAM: CompiledCard = {
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

it("restores a production delayed context with its closed timing drain and destination environment", async () => {
  const originalProgram = runtimeCompiledCard(CARD_ID)!;
  try {
    registerIrCard(CARD_ID, structuredClone(PROGRAM));
    const original = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "source" }], deck: ["BT1-010"] } });
    const destination = setupEngine({
      0: {
        battleArea: [
          { card: CARD_ID, as: "source" },
          { card: CARD_ID, as: "newcomer" },
        ],
        deck: ["BT1-019", "BT1-020"],
      },
    });
    const permanent = destination.perm("source");
    destination.inst("source").instanceId = original.inst("source").instanceId;
    permanent.permanentId = original.perm("source").permanentId;
    const environment = buildResolutionEnv(effectEnvironment(original.engine, {}), resolutionDeps(original.engine));
    await resolveTiming(EffectTiming.OnPlay, environment);
    const originalSubscription = original.engine.subTriggers.subscriptionsFor("endOfTurn")[0]!;
    expect(originalSubscription.activationContext?.drainCurrentTimingWindow).toBeTypeOf("function");
    const snapshot = original.engine.subTriggers.snapshot({
      callbacks: original.engine.runtimeCallbacks,
      objects: original.engine.runtimeObjects,
      references: original.engine.runtimeReferences,
    });
    destination.engine.subTriggers.restore({
      snapshot: JSON.parse(JSON.stringify(snapshot)),
      callbacks: destination.engine.runtimeCallbacks,
      objects: destination.engine.runtimeObjects,
      references: destination.engine.runtimeReferences,
    });
    const restored = destination.engine.subTriggers.subscriptionsFor("endOfTurn")[0]!;
    expect(restored.activationContext?.source.permanent()).toBe(permanent);
    const originalAnnouncements = original.events.filter((event) => event.kind === "effectTriggered").length;
    const destinationAnnouncements = destination.events.filter((event) => event.kind === "effectTriggered").length;
    expect(restored.activationContext!.isActivationPending!()).toBe(false);
    restored.activationContext!.onActivationChosen!();
    expect(original.events.filter((event) => event.kind === "effectTriggered")).toHaveLength(originalAnnouncements);
    expect(destination.events.filter((event) => event.kind === "effectTriggered")).toHaveLength(
      destinationAnnouncements,
    );
    expect(restored.activationContext?.drainCurrentTimingWindow).not.toBe(
      originalSubscription.activationContext?.drainCurrentTimingWindow,
    );
    await restored.activationContext!.drainCurrentTimingWindow!();
    expect(destination.engine.subTriggers.subscriptionsFor("endOfTurn")).toHaveLength(2);
    expect(original.engine.subTriggers.subscriptionsFor("endOfTurn")).toHaveLength(1);
    destination.state.turnSeat = 1;
    expect(
      await destination.engine.subTriggers.fire("endOfTurn", (subscription) =>
        buildSubTriggerContext(destination.engine, subscription, {}),
      ),
    ).toBe(2);
    expect(destination.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-019", "BT1-020"]);
    expect(original.state.players[0]!.hand).toHaveLength(0);
    expect(destination.engine.subTriggers.subscriptionsFor("endOfTurn")).toHaveLength(0);
  } finally {
    registerIrCard(CARD_ID, originalProgram);
  }
});

it("preserves event ordering seat while binding dynamic candidates and terminal checks to the destination", () => {
  const original = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "source" }] } });
  const destination = setupEngine({ 1: { battleArea: [{ card: "BT1-010", as: "other" }] } });
  original.state.turnSeat = 1;
  const environment = buildResolutionEnv(
    effectEnvironment(original.engine, { enteredByEffect: 0 }),
    resolutionDeps(original.engine),
  );
  const snapshot = encodeRuntimeGraph({
    value: environment,
    describeObject: original.engine.runtimeObjects.describe.bind(original.engine.runtimeObjects),
    describeCallback: original.engine.runtimeCallbacks.describe.bind(original.engine.runtimeCallbacks),
    references: original.engine.runtimeReferences,
  });
  destination.state.turnSeat = 0;
  const restored = decodeRuntimeGraph({
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    objects: destination.engine.runtimeObjects,
    createCallback: destination.engine.runtimeCallbacks.create.bind(destination.engine.runtimeCallbacks),
    references: destination.engine.runtimeReferences,
  }) as ResolutionEnv;
  expect(restored.turnSeat).toBe(1);
  expect(restored.tracker).toBe(destination.engine.tracker);
  expect(restored.isGameOver()).toBe(false);
  destination.state.gameOver = true;
  expect(restored.isGameOver()).toBe(true);
  expect(environment.isGameOver()).toBe(false);
});

it("rejects customized dependency and environment ports instead of recreating different behavior", () => {
  const setup = setupEngine({});
  const dependencies = resolutionDeps(setup.engine);
  const framework = effectEnvironment(setup.engine, {});
  const environment = buildResolutionEnv(framework, dependencies);
  environment.collect = () => [];
  expect(() => setup.engine.runtimeObjects.describe(environment)).toThrow("specialized runtime ports");
  dependencies.isGameOver = () => true;
  expect(() => setup.engine.runtimeObjects.describe(dependencies)).toThrow("specialized runtime ports");
  const unmodified = buildResolutionEnv(framework, resolutionDeps(setup.engine));
  framework.fx = { ...framework.fx };
  expect(() => setup.engine.runtimeObjects.describe(unmodified)).toThrow("specialized runtime ports");
});

it.each(["instance", "permanent"] as const)(
  "restores a closed drain created by the engine's %s timing path",
  async (scope) => {
    const originalProgram = runtimeCompiledCard(CARD_ID)!;
    try {
      registerIrCard(CARD_ID, structuredClone(PROGRAM));
      const original = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "source" }] } });
      const destination = setupEngine({
        0: {
          battleArea: [
            { card: CARD_ID, as: "source" },
            { card: CARD_ID, as: "newcomer" },
          ],
          deck: ["BT1-019"],
        },
      });
      const permanent = destination.perm("source");
      destination.inst("source").instanceId = original.inst("source").instanceId;
      permanent.permanentId = original.perm("source").permanentId;
      if (scope === "instance") {
        await fireTimingForInstance(original.engine, EffectTiming.OnPlay, original.inst("source").instanceId);
      } else {
        await fireTimingForPermanent(original.engine, EffectTiming.OnPlay, original.perm("source"));
      }
      expect(original.engine.subTriggers.subscriptionsFor("endOfTurn")).toHaveLength(1);
      const snapshot = original.engine.subTriggers.snapshot({
        callbacks: original.engine.runtimeCallbacks,
        objects: original.engine.runtimeObjects,
        references: original.engine.runtimeReferences,
      });
      destination.engine.subTriggers.restore({
        snapshot: JSON.parse(JSON.stringify(snapshot)),
        callbacks: destination.engine.runtimeCallbacks,
        objects: destination.engine.runtimeObjects,
        references: destination.engine.runtimeReferences,
      });
      const restored = destination.engine.subTriggers.subscriptionsFor("endOfTurn")[0]!;
      await restored.activationContext!.drainCurrentTimingWindow!();
      expect(destination.engine.subTriggers.subscriptionsFor("endOfTurn")).toHaveLength(1);
      expect(original.engine.subTriggers.subscriptionsFor("endOfTurn")).toHaveLength(1);
      destination.state.turnSeat = 1;
      expect(
        await destination.engine.subTriggers.fire("endOfTurn", (subscription) =>
          buildSubTriggerContext(destination.engine, subscription, {}),
        ),
      ).toBe(1);
      expect(destination.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-019"]);
      expect(original.state.players[0]!.hand).toHaveLength(0);
    } finally {
      registerIrCard(CARD_ID, originalProgram);
    }
  },
);

it("preserves local pending queues, exclusion aliases and announcement receipts", () => {
  const originalProgram = runtimeCompiledCard(CARD_ID)!;
  try {
    registerIrCard(CARD_ID, structuredClone(PROGRAM));
    const original = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "source" }] } });
    const destination = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "source" }] } });
    const permanent = destination.perm("source");
    destination.inst("source").instanceId = original.inst("source").instanceId;
    permanent.permanentId = original.perm("source").permanentId;
    const source = cardSourceOf(original.engine, original.inst("source"));
    const collected: CollectedEffect = {
      source,
      effect: getEffectModule(CARD_ID)!.effectsForTiming(EffectTiming.OnPlay, source)[0]!,
      timing: EffectTiming.OnPlay,
    };
    const reactionPending = [collected];
    const dependencies = resolutionDeps(original.engine, undefined, {
      reactionPending,
      extraPending: [],
      excludeNestedPending: new Set([collected]),
    });
    dependencies.onActivating!(EffectTiming.OnPlay, collected);
    const snapshot = encodeRuntimeGraph({
      value: { dependencies, collected, reactionPending },
      describeObject: original.engine.runtimeObjects.describe.bind(original.engine.runtimeObjects),
      describeCallback: original.engine.runtimeCallbacks.describe.bind(original.engine.runtimeCallbacks),
      references: original.engine.runtimeReferences,
    });
    const restored = decodeRuntimeGraph({
      snapshot: JSON.parse(JSON.stringify(snapshot)),
      objects: destination.engine.runtimeObjects,
      createCallback: destination.engine.runtimeCallbacks.create.bind(destination.engine.runtimeCallbacks),
      references: destination.engine.runtimeReferences,
    }) as { dependencies: ResolutionDeps; collected: CollectedEffect; reactionPending: CollectedEffect[] };
    expect(restored.dependencies.collectPending!()).toEqual([restored.collected]);
    restored.dependencies.onResolving!(EffectTiming.OnPlay, restored.collected);
    expect(restored.reactionPending).toHaveLength(0);
    expect(reactionPending).toEqual([collected]);
    expect(restored.dependencies.collectPending!()).toEqual([]);
    restored.dependencies.onResolved!(EffectTiming.OnPlay, restored.collected);
    restored.dependencies.onResolved!(EffectTiming.OnPlay, restored.collected);
    expect(destination.events.filter((event) => event.kind === "effectResolved")).toHaveLength(1);
    expect(original.events.filter((event) => event.kind === "effectResolved")).toHaveLength(0);
  } finally {
    registerIrCard(CARD_ID, originalProgram);
  }
});

it("restores the historical event subject and closed drain after its source leaves the field", async () => {
  const originalProgram = runtimeCompiledCard(CARD_ID)!;
  try {
    registerIrCard(CARD_ID, structuredClone(PROGRAM));
    const original = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "source" }] } });
    const destination = setupEngine({ 0: { trash: [{ card: CARD_ID, as: "source" }], deck: ["BT1-019"] } });
    const historical = original.perm("source");
    destination.inst("source").instanceId = original.inst("source").instanceId;
    await fireTimingForPermanent(original.engine, EffectTiming.OnPlay, historical, { playedSubject: historical });
    original.state.players[0]!.battleArea.splice(0, 1);
    original.state.players[0]!.trash.push(historical.topCard);
    historical.currentDP = 14000;
    const snapshot = original.engine.subTriggers.snapshot({
      callbacks: original.engine.runtimeCallbacks,
      objects: original.engine.runtimeObjects,
      references: original.engine.runtimeReferences,
    });
    destination.engine.subTriggers.restore({
      snapshot: JSON.parse(JSON.stringify(snapshot)),
      callbacks: destination.engine.runtimeCallbacks,
      objects: destination.engine.runtimeObjects,
      references: destination.engine.runtimeReferences,
    });
    const restored = destination.engine.subTriggers.subscriptionsFor("endOfTurn")[0]!;
    const context = restored.activationContext!;
    expect(context.source.permanent()).toBeUndefined();
    expect(context.trigger.playedSubject).toBeInstanceOf(Permanent);
    expect(context.trigger.playedSubject!.currentDP).toBe(14000);
    expect(context.trigger.playedSubject!.topCard.instanceId).toBe(historical.topCard.instanceId);
    expect(context.trigger.playedSubject).not.toBe(historical);
    await context.drainCurrentTimingWindow!();
    expect(destination.engine.subTriggers.subscriptionsFor("endOfTurn")).toHaveLength(1);
    destination.state.turnSeat = 1;
    expect(
      await destination.engine.subTriggers.fire("endOfTurn", (subscription) =>
        buildSubTriggerContext(destination.engine, subscription, {}),
      ),
    ).toBe(1);
    expect(destination.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-019"]);
    expect(original.state.players[0]!.hand).toHaveLength(0);
    expect(original.engine.subTriggers.subscriptionsFor("endOfTurn")).toHaveLength(1);
  } finally {
    registerIrCard(CARD_ID, originalProgram);
  }
});
