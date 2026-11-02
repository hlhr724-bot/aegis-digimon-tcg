import "#api/cards/ST10/ST10-04";
import { expect, it } from "vitest";
import type { Action } from "@aegis/shared/effects/ir/actions/action";
import { GameState } from "@aegis/shared/schema/GameState";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import { GameEngine } from "#api/engine/GameEngine";
import { buildEffectContext, cardSourceOf } from "#api/engine/gameEngine/effectContext";
import type { EffectContext } from "#api/engine/effects/context/effectContext";
import type { ReplacementInstallInstead, ReplacementInstallPrevent } from "#api/engine/effects/context/replacements";
import { runReplacement } from "#api/engine/effects/interpreter/actions/replacement";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { RuntimeGraphDecoder } from "#api/engine/snapshot/RuntimeGraphDecoder";
import { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { registerEngineSchemaFactories } from "#api/engine/snapshot/schema/registerEngineSchemaFactories";
import { setupEngine } from "#api/engine/testkit/harness";

type Install = ReplacementInstallPrevent | ReplacementInstallInstead;

async function cloneLeaveReplacement({ action }: { action: Extract<Action, { kind: "Replacement" }> }) {
  const original = setupEngine({
    0: {
      battleArea: [
        { card: "ST10-04", as: "source" },
        { card: "ST10-04", as: "ally" },
      ],
    },
  });
  const self = original.perm("source");
  const ally = original.perm("ally");
  const ctx = buildEffectContext(original.engine, cardSourceOf(original.engine, original.inst("source")), {});
  await runReplacement(ctx, action);
  const install = original.engine.subTriggers.getRuntimeState().replacements.at(-1) as Install;
  const graph = encodeRuntimeGraph({
    value: { state: original.state, ctx, self, ally, install },
    references: original.engine.runtimeReferences,
    describeObject: (value) => original.engine.runtimeObjects.describe(value),
    describeCallback: (callback) => original.engine.runtimeCallbacks.describe(callback),
  });
  const objects = new RuntimeObjectRegistry();
  registerEngineSchemaFactories({ objects });
  const decoder = new RuntimeGraphDecoder({ snapshot: JSON.parse(JSON.stringify(graph)), objects });
  const state = decoder.decodeRootField({ key: "state" });
  expect(state).toBeInstanceOf(GameState);
  const engine = new GameEngine(state as GameState, { seed: 1, emit: () => {}, requestDecision: () => {} });
  decoder.bindRuntimePorts({
    objects: engine.runtimeObjects,
    references: engine.runtimeReferences,
    createCallback: (descriptor) => engine.runtimeCallbacks.create(descriptor),
  });
  return decoder.decodeRoot() as { ctx: EffectContext; self: Permanent; ally: Permanent; install: Install };
}

it("restores a self prevention's cause gate and protected permanent", async () => {
  const restored = await cloneLeaveReplacement({
    action: {
      kind: "Replacement",
      event: "wouldLeavePlay",
      mode: "prevent",
      leaveCause: "byOpponentEffect",
      target: { filter: { isSelfRef: true }, isSelf: true, count: 1 },
    },
  });
  const install = restored.install as ReplacementInstallPrevent;
  expect(install.mode).toBe("prevent");
  expect(install.causeAllows!("byEffect", 1, false)).toBe(true);
  expect(install.causeAllows!("byEffect", 0, false)).toBe(false);
  expect(install.causeAllows!("byBattle", undefined, false)).toBe(false);
  expect(install.protects!(restored.ctx, restored.self.permanentId)).toBe(true);
  expect(install.protects!(restored.ctx, restored.ally.permanentId)).toBe(false);
  expect(typeof install.preventCheck).toBe("function");
});

it("restores an instead reaction's cause gate and leaving-permanent filter", async () => {
  const restored = await cloneLeaveReplacement({
    action: {
      kind: "Replacement",
      event: "wouldBeDeleted",
      mode: "instead",
      leaveCause: "byBattle",
      sourceFilter: { isSelfRef: true },
      actions: [],
    },
  });
  const install = restored.install as ReplacementInstallInstead;
  expect(install.mode).toBe("instead");
  expect(install.causeAllows!("byBattle", undefined, false)).toBe(true);
  expect(install.causeAllows!("byEffect", 1, false)).toBe(false);
  expect(install.appliesTo!(restored.ctx, restored.self.permanentId)).toBe(true);
  expect(install.appliesTo!(restored.ctx, restored.ally.permanentId)).toBe(false);
  expect(await install.apply(restored.ctx)).toBe(true);
});
