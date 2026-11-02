import type { CardSource } from "#api/engine/effects/CardSource";
import { expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { resolveTiming, type ResolutionEnv } from "#api/engine/effects/stack";
import { setupEngine } from "#api/engine/testkit/harness";
import { buildEffectContext, cardSourceOf } from "#api/engine/gameEngine/effectContext";
import type { CollectedEffect } from "#api/engine/effects/collect";
import type { TimingWindowRuntime } from "#api/engine/effects/resolution/TimingWindowRuntime";
import { TimingWindowState } from "#api/engine/effects/resolution/TimingWindowState";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";

type World = { originalPresent: boolean; newPresent: boolean };
type Params = { setup: ReturnType<typeof setupEngine>; world: World; events: string[]; source?: CardSource };

function createEnvironment({ setup, world, events, source: providedSource }: Params): ResolutionEnv {
  const source = providedSource ?? cardSourceOf(setup.engine, setup.inst("source"));
  const original: CollectedEffect = {
    source,
    effect: {
      effectKey: "original-effect",
      description: "original effect",
      optional: false,
      isInherited: false,
      isSecurity: false,
      isLinked: false,
      maxPerTurn: -1,
      canTrigger: () => true,
      canActivate: () => true,
      resolve: async () => {
        events.push("original");
        world.originalPresent = false;
      },
    },
  };
  const newer: CollectedEffect = {
    ...original,
    effect: {
      ...original.effect,
      effectKey: "new-effect",
      resolve: async () => {
        events.push("new");
        world.newPresent = false;
      },
    },
  };
  return {
    runtimeObjects: setup.engine.runtimeObjects,
    turnSeat: 0,
    tracker: setup.engine.tracker,
    collect: () => [...(world.originalPresent ? [original] : []), ...(world.newPresent ? [newer] : [])],
    makeContext: (collected) => buildEffectContext(setup.engine, collected.source, {}),
    ruleProcess: async () => {},
    isGameOver: () => false,
    chooseOrder: async () => 0,
    askOptional: async () => true,
  };
}

it("resumes a JSON-restored closed window with the same retirement latches and counters", async () => {
  const original = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const destination = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const destinationPermanent = destination.perm("source");
  const destinationCard = destination.inst("source");
  destinationCard.instanceId = original.inst("source").instanceId;
  destinationPermanent.permanentId = original.perm("source").permanentId;
  const world = { originalPresent: true, newPresent: false };
  const events: string[] = [];
  const env = createEnvironment({ setup: original, world, events });
  let runtime: TimingWindowRuntime | undefined;
  let registrations = 0;
  let unregisters = 0;
  env.registerPendingEffects = () => {
    registrations++;
    return () => {
      unregisters++;
    };
  };
  env.onTimingWindowCreated = (created) => {
    runtime = created;
    expect(() => created.state.snapshot({ objects: original.engine.runtimeObjects })).toThrow("active timing window");
  };
  await resolveTiming(EffectTiming.OnPlay, env);
  expect(events).toEqual(["original"]);
  expect(runtime!.state.scopeOpen).toBe(false);
  const snapshot = encodeRuntimeGraph({
    value: runtime!.state,
    describeObject: original.engine.runtimeObjects.describe.bind(original.engine.runtimeObjects),
  });
  const restored = decodeRuntimeGraph({
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    objects: destination.engine.runtimeObjects,
  }) as TimingWindowState;
  const destinationWorld = { originalPresent: true, newPresent: true };
  const destinationEvents = [...events];
  const destinationEnv = createEnvironment({
    setup: destination,
    world: destinationWorld,
    events: destinationEvents,
    source: cardSourceOf(destination.engine, destinationCard),
  });
  let resumedRegistrations = 0;
  destinationEnv.registerPendingEffects = () => {
    resumedRegistrations++;
    return () => {};
  };
  world.originalPresent = true;
  world.newPresent = true;
  const draining = runtime!.drain();
  expect(runtime!.state.activeDrains).toBe(1);
  expect(() => runtime!.state.getRuntimeState()).toThrow("active timing window");
  await draining;
  expect(runtime!.state.activeDrains).toBe(0);
  await resolveTiming(EffectTiming.OnPlay, destinationEnv, { state: restored });
  expect(destinationEvents).toEqual(["original", "new"]);
  expect(destinationEvents).toEqual(events);
  expect(restored.passes).toBe(runtime!.state.passes);
  expect(restored.newestTier).toBe(runtime!.state.newestTier);
  expect(restored.resolved).toEqual(runtime!.state.resolved);
  expect(restored.departed).toEqual(runtime!.state.departed);
  expect(registrations).toBe(1);
  expect(unregisters).toBe(1);
  expect(resumedRegistrations).toBe(0);
});

it("rejects resuming a live window and a window bound to another timing", async () => {
  const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const env = createEnvironment({ setup, world: { originalPresent: false, newPresent: false }, events: [] });
  let runtime: TimingWindowRuntime | undefined;
  env.onTimingWindowCreated = (created) => {
    runtime = created;
  };
  await resolveTiming(EffectTiming.OnPlay, env);
  await expect(resolveTiming(EffectTiming.OnEndTurn, env, { state: runtime!.state })).rejects.toThrow("mismatched");
  runtime!.state.scopeOpen = true;
  await expect(resolveTiming(EffectTiming.OnPlay, env, { state: runtime!.state })).rejects.toThrow("active");
  runtime!.state.scopeOpen = false;
});

it("restores only declared window fields without changing its prototype", () => {
  const state = new TimingWindowState({ timing: EffectTiming.OnPlay, passBudget: 1000 });
  const payload = Object.assign(Object.create(null), state.getRuntimeState());
  Object.defineProperty(payload, "__proto__", { value: { injected: true }, enumerable: true });
  state.restoreRuntimeState(payload);
  expect(state).toBeInstanceOf(TimingWindowState);
  expect(Object.hasOwn(state, "__proto__")).toBe(false);
  expect(Object.getPrototypeOf(state)).toBe(TimingWindowState.prototype);
});
