import { expect, it } from "vitest";
import { buildEffectContext, cardSourceOf } from "#api/engine/gameEngine/effectContext";
import { buildSubTriggerContext } from "#api/engine/gameEngine/subTriggers";
import { runControlFlowAction } from "#api/engine/effects/interpreter/actions/controlFlow";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import type { EffectContext } from "#api/engine/effects/context/effectContext";
import { setupEngine } from "#api/engine/testkit/harness";

it("restores source lookups and context ports against the destination engine", () => {
  const original = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const destination = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const destinationPermanent = destination.perm("source");
  destination.inst("source").instanceId = original.inst("source").instanceId;
  destinationPermanent.permanentId = original.perm("source").permanentId;
  const context = buildEffectContext(original.engine, cardSourceOf(original.engine, original.inst("source")), {});
  context.namedCounts = new Map([["stored", 3]]);
  const snapshot = encodeRuntimeGraph({
    value: [context, context.source, context],
    describeObject: original.engine.runtimeObjects.describe.bind(original.engine.runtimeObjects),
  });
  const [restored, source, alias] = decodeRuntimeGraph({
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    objects: destination.engine.runtimeObjects,
  }) as [EffectContext, EffectContext["source"], EffectContext];
  expect(restored).toBe(alias);
  expect(restored.source).toBe(source);
  expect(restored.source.permanent()).toBe(destinationPermanent);
  expect(restored.source.permanent()).not.toBe(original.perm("source"));
  expect(restored.game.state).toBe(destination.state);
  expect(restored.ask).toBe(destination.engine.decisionApi);
  restored.usage!.register("stored", "effect");
  expect(destination.engine.tracker.count("stored", "effect")).toBe(1);
  expect(original.engine.tracker.count("stored", "effect")).toBe(0);
  restored.namedCounts!.set("stored", 8);
  expect(context.namedCounts.get("stored")).toBe(3);
  destination.state.turnSeat = 1;
  expect(restored.source.isOwnersTurn()).toBe(false);
  expect(context.source.isOwnersTurn()).toBe(true);
});

it("round-trips an armed delayed subscription including its retained activation context", async () => {
  const original = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }], deck: ["BT1-010"] } });
  const destination = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }], deck: ["BT1-019"] } });
  const destinationPermanent = destination.perm("source");
  destination.inst("source").instanceId = original.inst("source").instanceId;
  destinationPermanent.permanentId = original.perm("source").permanentId;
  const context = buildEffectContext(original.engine, cardSourceOf(original.engine, original.inst("source")), {});
  context.namedCounts = new Map([["armed", 3]]);
  await runControlFlowAction(context, {
    kind: "DelayedEffect",
    trigger: "nextEndOfOpponentTurn",
    effect: { kind: "Draw", controller: "mine", amount: 1 },
  });
  const snapshot = original.engine.subTriggers.snapshot({
    callbacks: original.engine.runtimeCallbacks,
    objects: original.engine.runtimeObjects,
  });
  destination.engine.subTriggers.restore({
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    callbacks: destination.engine.runtimeCallbacks,
    objects: destination.engine.runtimeObjects,
  });
  const subscription = destination.engine.subTriggers.subscriptionsFor("endOfTurn")[0]!;
  expect(subscription.activationContext?.game.state).toBe(destination.state);
  expect(subscription.activationContext?.source.permanent()).toBe(destinationPermanent);
  destination.state.turnSeat = 1;
  expect(
    await destination.engine.subTriggers.fire("endOfTurn", (sub) =>
      buildSubTriggerContext(destination.engine, sub, {}),
    ),
  ).toBe(1);
  expect(destination.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-019"]);
  expect(original.state.players[0]!.hand).toHaveLength(0);
  expect(original.engine.subTriggers.subscriptionsFor("endOfTurn")).toHaveLength(1);
  expect(destination.engine.subTriggers.subscriptionsFor("endOfTurn")).toHaveLength(0);
});

it("refuses unresolved continuation functions instead of dropping them from retained state", () => {
  const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const context = buildEffectContext(setup.engine, cardSourceOf(setup.engine, setup.inst("source")), {});
  context.drainCurrentTimingWindow = async () => {};
  expect(() =>
    encodeRuntimeGraph({
      value: context,
      describeObject: setup.engine.runtimeObjects.describe.bind(setup.engine.runtimeObjects),
      describeCallback: setup.engine.runtimeCallbacks.describe.bind(setup.engine.runtimeCallbacks),
    }),
  ).toThrow("descriptor");
});

it("refuses specialized decision ports and gained source bindings until they have descriptors", () => {
  const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const source = cardSourceOf(setup.engine, setup.inst("source"));
  const context = buildEffectContext(setup.engine, source, {});
  context.ask = { ...context.ask };
  expect(() =>
    encodeRuntimeGraph({
      value: context,
      describeObject: setup.engine.runtimeObjects.describe.bind(setup.engine.runtimeObjects),
    }),
  ).toThrow("specialized runtime ports");
  Object.assign(source, { gainedOnPermanentId: "other-host" });
  expect(() =>
    encodeRuntimeGraph({
      value: source,
      describeObject: setup.engine.runtimeObjects.describe.bind(setup.engine.runtimeObjects),
    }),
  ).toThrow("specialized runtime descriptor");
});
