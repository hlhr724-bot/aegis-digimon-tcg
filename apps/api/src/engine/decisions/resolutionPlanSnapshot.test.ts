import { expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { ResolutionPlan } from "#api/engine/decisions/resolutionPlan";
import type { CollectedEffect } from "#api/engine/effects/collect";
import { setupEngine } from "#api/engine/testkit/harness";
import { cardSourceOf } from "#api/engine/gameEngine/effectContext";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";

it("retains activation keys, optional answers, grant anchors and shared identities through JSON", () => {
  const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const source = cardSourceOf(setup.engine, setup.inst("source"));
  const plan = new ResolutionPlan();
  const firstIdentity = {};
  const secondIdentity = {};
  const effect = { effectKey: "same-effect" } as CollectedEffect["effect"];
  const first: CollectedEffect = { source, effect, activationIdentity: firstIdentity, timing: EffectTiming.OnPlay };
  const second: CollectedEffect = { source, effect, activationIdentity: secondIdentity, timing: EffectTiming.OnPlay };
  const firstKey = plan.keyFor(first);
  const secondKey = plan.keyFor(second);
  expect(secondKey).not.toBe(firstKey);
  const grant: CollectedEffect = { source, effect, grantedEffectId: 7 };
  const grantKey = plan.keyFor(grant);
  plan.adopt([secondKey, firstKey], { [firstKey]: false, [secondKey]: true });
  setup.engine.runtimeObjects.track({ value: plan, key: EngineRuntimeObjectKind.RESOLUTION_PLAN.value });
  const snapshot = encodeRuntimeGraph({
    value: { plan, firstIdentity, secondIdentity, presets: plan.getRuntimeState().presets },
    describeObject: setup.engine.runtimeObjects.describe.bind(setup.engine.runtimeObjects),
  });
  const destination = setupEngine();
  const restored = decodeRuntimeGraph({
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    objects: destination.engine.runtimeObjects,
  }) as { plan: ResolutionPlan; firstIdentity: object; secondIdentity: object; presets: Map<string, boolean> };
  expect(restored.plan.keyFor({ ...first, activationIdentity: restored.firstIdentity })).toBe(firstKey);
  expect(restored.plan.keyFor({ ...second, activationIdentity: restored.secondIdentity })).toBe(secondKey);
  expect(restored.plan.nextOf([firstKey, secondKey])).toBe(secondKey);
  expect(restored.plan.presetFor(firstKey)).toBe(false);
  expect(restored.plan.presetFor(secondKey)).toBe(true);
  expect(restored.plan.getRuntimeState().presets).toBe(restored.presets);
  restored.presets.set(firstKey, true);
  expect(restored.plan.presetFor(firstKey)).toBe(true);
  expect(plan.presetFor(firstKey)).toBe(false);
  expect(restored.plan.keyFor({ ...grant, source: { ...source, instanceId: "evolved-top" } })).toBe(grantKey);
  const thirdKey = restored.plan.keyFor({ ...first, activationIdentity: {} });
  expect([firstKey, secondKey]).not.toContain(thirdKey);
});

it("restores plain plans independently and rejects malformed state atomically", () => {
  const original = new ResolutionPlan();
  original.adopt(["second", "first"], { first: false });
  const snapshot = original.snapshot();
  const restored = new ResolutionPlan();
  restored.restore({ snapshot: JSON.parse(JSON.stringify(snapshot)) });
  expect(restored.nextOf(["first", "second"])).toBe("second");
  restored.adopt(["first"], { first: true });
  expect(original.presetFor("first")).toBe(false);
  expect(() => restored.restoreRuntimeState({})).toThrow("Invalid resolution plan");
  expect(restored.presetFor("first")).toBe(true);
  restored.restoreRuntimeState(restored.getRuntimeState());
  expect(restored.presetFor("first")).toBe(true);
});
