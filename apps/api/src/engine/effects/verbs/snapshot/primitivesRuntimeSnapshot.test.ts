import "#api/cards/BT1/BT1-021";
import { expect, it } from "vitest";
import { EffectDuration } from "@aegis/shared/schema/enums";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { SeededRandom } from "#api/engine/random/SeededRandom";
import { assertEngineSnapshotBoundary } from "#api/engine/snapshot/assertEngineSnapshotBoundary";
import { snapshotGameEngine } from "#api/engine/snapshot/snapshotGameEngine";
import { restoreGameEngine } from "#api/engine/snapshot/restoreGameEngine";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";
import { getPrimitivesRuntimeState } from "#api/engine/effects/verbs/snapshot/getPrimitivesRuntimeState";
import { restorePrimitivesRuntimeState } from "#api/engine/effects/verbs/snapshot/restorePrimitivesRuntimeState";
import { primitivesRuntimeContexts } from "#api/engine/effects/verbs/snapshot/primitivesRuntimeContexts";
import type { PrimitivesRuntimeState } from "#api/engine/effects/verbs/snapshot/PrimitivesRuntimeState";

it("retains delayed memory loss after its printed source leaves and matches end-turn events", async () => {
  const original = setupEngine({
    0: { battleArea: [{ card: "BT1-021", as: "source" }], deck: ["BT1-014", "BT1-014"], hand: ["BT1-014"] },
    1: { security: ["BT1-025"], deck: ["BT1-014"], hand: ["BT1-014"] },
  });
  original.engine.randomStreams = [new SeededRandom({ seed: 1 }), new SeededRandom({ seed: 2 })];
  const running = original.engine.turnMachine.runTurn();
  await advance(original.engine).waitForMainPhase(0);
  const permanent = original.perm("source");
  original.state.memory = 0;
  expect(
    original.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: permanent.permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => {
    if (original.state.memory !== 3 || original.state.players[0]!.battleArea.length !== 0) {
      return false;
    }
    try {
      assertEngineSnapshotBoundary({ engine: original.engine });
      return true;
    } catch {
      return false;
    }
  });
  const events: ServerEvent[] = [];
  const restored = restoreGameEngine({
    snapshot: JSON.parse(JSON.stringify(snapshotGameEngine({ engine: original.engine }))),
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
  expect(restored.engine.state.memory).toBe(3);
  expect(restored.engine.subTriggers.subscriptionsFor("endOfTurn")).toHaveLength(1);
  expect(original.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  expect(restored.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  await Promise.all([running, restored.completion]);
  expect(events).toEqual(original.events.slice(prefix));
  expect(restored.engine.state.toJSON()).toEqual(original.state.toJSON());
  expect(restored.engine.state.memory).toBe(-6);
  expect(restored.engine.subTriggers.subscriptionsFor("endOfTurn")).toHaveLength(0);
});

it("retains primitive sequences, custom grants and expiring per-play DigiXros quotas", () => {
  const original = setupEngine();
  const destination = setupEngine();
  original.state.turnCount = 3;
  destination.state.turnCount = 3;
  original.engine.primitives.delayedGainMemory!(0, -3);
  original.engine.primitives.expandDigiXrosZones!(0, ["trash"], EffectDuration.Permanent);
  original.engine.primitives.expandDigiXrosZonesForPlay!(
    0,
    ["underMyTamers"],
    EffectDuration.UntilOwnerTurnEnd,
    "pending-play",
    { underMyTamers: 2 },
  );
  original.engine.primitives.grantCustom!("recipient", { token: "retained" }, EffectDuration.Permanent);
  const originalContext = primitivesRuntimeContexts.get(original.engine.primitives)!;
  originalContext.sequences.stripSequence = 7;
  const state = decodeRuntimeGraph({
    snapshot: JSON.parse(
      JSON.stringify(
        encodeRuntimeGraph({ value: getPrimitivesRuntimeState({ primitives: original.engine.primitives }) }),
      ),
    ),
  }) as PrimitivesRuntimeState;
  restorePrimitivesRuntimeState({ primitives: destination.engine.primitives, state });
  destination.engine.primitives.delayedGainMemory!(0, -3);
  expect(destination.engine.subTriggers.subscriptionsFor("endOfTurn")[0]!.description).toContain("#2");
  expect(getPrimitivesRuntimeState({ primitives: destination.engine.primitives }).stripSequence).toBe(7);
  expect(destination.engine.primitives.digiXrosExpandedZones!(0, "different-play")).toEqual(["trash"]);
  expect(destination.engine.primitives.digiXrosExpandedZoneCounts!(0, "pending-play")).toEqual({
    trash: 1,
    underMyTamers: 2,
  });
  expect(destination.engine.primitives.digiXrosPlayExpansionCount!(0, "pending-play")).toBe(1);
  destination.engine.primitives.consumeDigiXrosPlayExpansions!(0, "pending-play");
  expect(destination.engine.primitives.digiXrosExpandedZones!(0, "pending-play")).toEqual(["trash"]);
  expect(original.engine.primitives.digiXrosPlayExpansionCount!(0, "pending-play")).toBe(1);
  expect(primitivesRuntimeContexts.get(destination.engine.primitives)!.customGrants.get("recipient")).toEqual([
    { grant: { token: "retained" }, duration: EffectDuration.Permanent },
  ]);
  destination.engine.primitives.expandDigiXrosZones!(0, ["hand"], EffectDuration.UntilOwnerTurnEnd);
  destination.state.turnCount = 4;
  expect(destination.engine.primitives.digiXrosExpandedZones!(0)).toEqual(["trash"]);
});

it("rejects a primitive effect scope and invalid counters before restoring any state", () => {
  const setup = setupEngine();
  const context = primitivesRuntimeContexts.get(setup.engine.primitives)!;
  const state = getPrimitivesRuntimeState({ primitives: setup.engine.primitives });
  context.effectSeatStack.push(0);
  expect(() => getPrimitivesRuntimeState({ primitives: setup.engine.primitives })).toThrow(
    "active primitive effect scope",
  );
  context.effectSeatStack.pop();
  expect(() =>
    restorePrimitivesRuntimeState({ primitives: setup.engine.primitives, state: { ...state, stripSequence: -1 } }),
  ).toThrow("Invalid primitives runtime state");
  expect(() =>
    restorePrimitivesRuntimeState({
      primitives: setup.engine.primitives,
      state: {
        ...state,
        delayedMemorySequence: 9,
        digiXrosZoneExpansions: new Map([
          [
            0,
            [{ zones: ["trash"], duration: EffectDuration.Permanent, activationTurnCount: -1, activationTurnSeat: 0 }],
          ],
        ]),
      },
    }),
  ).toThrow("Invalid DigiXros expansion state");
  expect(getPrimitivesRuntimeState({ primitives: setup.engine.primitives }).delayedMemorySequence).toBe(0);
  const invalidGrant = { grant: {}, duration: EffectDuration.Permanent };
  Reflect.set(invalidGrant, "duration", -1);
  expect(() =>
    restorePrimitivesRuntimeState({
      primitives: setup.engine.primitives,
      state: {
        ...state,
        delayedMemorySequence: 9,
        customGrants: new Map([["recipient", [invalidGrant]]]),
      },
    }),
  ).toThrow("Invalid custom primitive grant state");
  expect(getPrimitivesRuntimeState({ primitives: setup.engine.primitives }).delayedMemorySequence).toBe(0);
  expect(getPrimitivesRuntimeState({ primitives: setup.engine.primitives }).stripSequence).toBe(0);
});

it("continues stack-strip event identities after restoring primitive state", async () => {
  const board = { 0: { battleArea: [{ card: "BT1-021", as: "source", under: ["BT1-014"] }] } };
  const original = setupEngine(board, { fixtureIds: true });
  const destination = setupEngine(board, { fixtureIds: true });
  primitivesRuntimeContexts.get(original.engine.primitives)!.sequences.stripSequence = 7;
  const snapshot = encodeRuntimeGraph({ value: getPrimitivesRuntimeState({ primitives: original.engine.primitives }) });
  restorePrimitivesRuntimeState({
    primitives: destination.engine.primitives,
    state: decodeRuntimeGraph({ snapshot: JSON.parse(JSON.stringify(snapshot)) }) as PrimitivesRuntimeState,
  });
  await original.engine.primitives.deDigivolve(original.perm("source").permanentId, 1);
  await destination.engine.primitives.deDigivolve(destination.perm("source").permanentId, 1);
  const originalEvents = original.events.filter((event) => event.kind === "stackTopResolved");
  const destinationEvents = destination.events.filter((event) => event.kind === "stackTopResolved");
  expect(originalEvents).toHaveLength(1);
  expect(destinationEvents).toEqual(originalEvents);
  expect(destinationEvents[0]!.sequenceId).toContain("/strip/8");
});
