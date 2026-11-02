import "#api/cards/ST10/ST10-04";
import "#api/cards/ST10/ST10-05";
import { expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { GameState } from "@aegis/shared/schema/GameState";
import { GameEngine } from "#api/engine/GameEngine";
import { buildEffectContext, cardSourceOf } from "#api/engine/gameEngine/effectContext";
import { runReplacement } from "#api/engine/effects/interpreter/actions/replacement";
import type { CostReplacementInstall } from "#api/engine/effects/interpreter/replacements/CostReplacementInstall";
import { SeededRandom } from "#api/engine/random/SeededRandom";
import { snapshotGameEngine } from "#api/engine/snapshot/snapshotGameEngine";
import { restoreGameEngine } from "#api/engine/snapshot/restoreGameEngine";
import { assertEngineSnapshotBoundary } from "#api/engine/snapshot/assertEngineSnapshotBoundary";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { RuntimeGraphDecoder } from "#api/engine/snapshot/RuntimeGraphDecoder";
import { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { registerEngineSchemaFactories } from "#api/engine/snapshot/schema/registerEngineSchemaFactories";
import type { EffectContext } from "#api/engine/effects/context/effectContext";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

type BoundaryParams = { engine: GameEngine };

async function waitForSnapshotBoundary({ engine }: BoundaryParams): Promise<void> {
  await settle(() => {
    try {
      assertEngineSnapshotBoundary({ engine });
      return true;
    } catch {
      return false;
    }
  });
}

type CloneParams = { action: Extract<Action, { kind: "Replacement" }> };

async function cloneCostReplacement({ action }: CloneParams) {
  const original = setupEngine({ 0: { battleArea: [{ card: "ST10-04", as: "source" }] } });
  const self = original.perm("source");
  const ctx = buildEffectContext(original.engine, cardSourceOf(original.engine, original.inst("source")), {});
  await runReplacement(ctx, action);
  const install = original.engine.subTriggers.getRuntimeState().replacements.at(-1) as CostReplacementInstall;
  const graph = encodeRuntimeGraph({
    value: { state: original.state, ctx, self, install },
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
  const restored = decoder.decodeRoot() as { ctx: EffectContext; self: Permanent; install: CostReplacementInstall };
  return { original, self, ctx, install, restored, engine };
}

it("restores a resident trait discount and preserves future digivolution costs and events", async () => {
  const original = setupEngine({
    0: {
      battleArea: [{ card: "ST10-04", as: "source" }],
      hand: [{ card: "ST10-05", as: "evolution" }, "BT1-009"],
    },
  });
  original.state.isFirstPlayersFirstTurn = true;
  original.engine.randomStreams = [new SeededRandom({ seed: 1 }), new SeededRandom({ seed: 2 })];
  const running = original.engine.turnMachine.runTurn();
  await advance(original.engine).waitForMainPhase(0);
  original.state.memory = 10;
  const snapshot = JSON.parse(JSON.stringify(snapshotGameEngine({ engine: original.engine })));
  const events: ServerEvent[] = [];
  const restored = restoreGameEngine({
    snapshot,
    hooks: {
      seed: 1,
      emit: (event) => {
        events.push(event);
      },
      requestDecision: () => {
        throw new Error("Unexpected decision");
      },
    },
  });
  const prefix = original.events.length;
  const intent = {
    type: "digivolve",
    permanentId: original.perm("source").permanentId,
    instanceId: original.inst("evolution").instanceId,
  } as const;
  expect(original.engine.applyIntent(0, intent)).toEqual({ ok: true });
  expect(restored.engine.applyIntent(0, intent)).toEqual({ ok: true });
  await Promise.all([
    waitForSnapshotBoundary({ engine: original.engine }),
    waitForSnapshotBoundary({ engine: restored.engine }),
  ]);
  expect(original.state.memory).toBe(9);
  expect(restored.engine.state.toJSON()).toEqual(original.state.toJSON());
  expect(events).toEqual(original.events.slice(prefix));
  expect(original.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  expect(restored.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  await Promise.all([running, restored.completion]);
  expect(events).toEqual(original.events.slice(prefix));
  expect(restored.engine.state.toJSON()).toEqual(original.state.toJSON());
});

it("restores filtered interactive payment and color scaling against destination source identities", async () => {
  const result = await cloneCostReplacement({
    action: {
      kind: "Replacement",
      event: "wouldDigivolve",
      mode: "reduceCost",
      amount: 2,
      scaling: { unit: "colors", per: 1 },
      into: { colors: ["Yellow"], zone: "hand" },
      sourceFilter: { isSelfRef: true },
      optional: false,
      cost: { kind: "suspend", target: { filter: { isSelfRef: true }, isSelf: true, count: 1 } },
    },
  });
  const { restored, engine } = result;
  const definition = getCardDefinition("ST10-04")!;
  expect(restored.self).toBe(engine.access.permanentById(result.self.permanentId));
  expect(restored.install.intoMatches!(definition)).toBe(true);
  expect(restored.install.intoMatches!(getCardDefinition("BT1-009")!)).toBe(false);
  expect(restored.install.appliesTo!(restored.self, "hand")).toBe(true);
  expect(restored.install.appliesTo!(restored.self, "trash")).toBe(false);
  expect(restored.install.amountForInto!(definition)).toBe(4);
  expect(await restored.install.activate!(restored.ctx, restored.self, definition, "future-evolution")).toBe(true);
  expect(restored.self.isSuspended).toBe(true);
  expect(result.self.isSuspended).toBe(false);
  expect(restored.ctx.reservedCostInstanceIds?.has("future-evolution")).toBe(true);
  expect(result.ctx.reservedCostInstanceIds).toBeUndefined();
});

it("rechecks conditional reduction choices using only the restored board", async () => {
  const { restored, engine, install, self } = await cloneCostReplacement({
    action: {
      kind: "Replacement",
      event: "wouldBePlayed",
      mode: "reduceCost",
      optional: false,
      amountChoices: [
        { amount: 2 },
        { amount: 4, condition: { kind: "youHave", filter: { zone: "battleArea", colors: ["Yellow"] } } },
      ],
    },
  });
  expect(restored.install.potentialAmount!(restored.self)).toBe(4);
  engine.state.players[0]!.battleArea.clear();
  expect(restored.install.potentialAmount!(restored.self)).toBe(2);
  expect(install.potentialAmount!(self)).toBe(4);
  expect(await restored.install.activate!(restored.ctx, restored.self, getCardDefinition("ST10-04")!)).toBe(2);
});
