import "#api/cards/BT1/BT1-086";
import { expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import { GameState } from "@aegis/shared/schema/GameState";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { GameEngine } from "#api/engine/GameEngine";
import { SeededRandom } from "#api/engine/random/SeededRandom";
import { snapshotGameEngine } from "#api/engine/snapshot/snapshotGameEngine";
import { restoreGameEngine } from "#api/engine/snapshot/restoreGameEngine";
import { assertEngineSnapshotBoundary } from "#api/engine/snapshot/assertEngineSnapshotBoundary";
import { RuntimeGraphDecoder } from "#api/engine/snapshot/RuntimeGraphDecoder";
import { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { registerEngineSchemaFactories } from "#api/engine/snapshot/schema/registerEngineSchemaFactories";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { buildEffectContext, cardSourceOf } from "#api/engine/gameEngine/effectContext";
import type { SubTriggerSubscription } from "#api/engine/effects/subtriggers";
import type { EffectContext } from "#api/engine/effects/context/effectContext";
import type { TriggerInfo } from "#api/engine/effects/context/triggers";
import { MatchedTriggerHistory } from "#api/engine/effects/interpreter/subtriggers/MatchedTriggerHistory";

type WaitParams = { engine: GameEngine };

async function waitForSnapshotBoundary({ engine }: WaitParams): Promise<void> {
  await settle(() => {
    try {
      assertEngineSnapshotBoundary({ engine });
      return true;
    } catch {
      return false;
    }
  });
}

it("restores a filtered continuous watcher and matches future play decisions, effects and events", async () => {
  const original = setupEngine(
    {
      0: { battleArea: [{ card: "BT1-086", as: "watcher" }], hand: [{ card: "BT1-028", as: "played" }, "BT1-009"] },
      1: { battleArea: [{ card: "BT1-014", as: "target", under: ["BT1-009"] }] },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  original.state.isFirstPlayersFirstTurn = true;
  original.engine.randomStreams = [new SeededRandom({ seed: 1 }), new SeededRandom({ seed: 2 })];
  const running = original.engine.turnMachine.runTurn();
  await advance(original.engine).waitForMainPhase(0);
  original.state.memory = 10;
  const snapshot = JSON.parse(JSON.stringify(snapshotGameEngine({ engine: original.engine })));
  const events: ServerEvent[] = [];
  let destination: GameEngine | undefined;
  const restored = restoreGameEngine({
    snapshot,
    hooks: {
      seed: 1,
      emit: (event) => {
        events.push(event);
      },
      requestDecision: (seat, request) => {
        let response: DecisionResponse;
        if (request.kind === "optional") {
          response = { kind: "optional", accept: true };
        } else if (request.kind === "chooseTargets" || request.kind === "selectCards") {
          response = {
            kind: request.kind,
            instanceIds: (request.options?.candidateInstanceIds ?? []).slice(0, request.options?.max ?? 1),
          };
        } else if (request.kind === "orderTriggers") {
          response = { kind: "orderTriggers", order: (request.options?.triggerKeys ?? []).slice(0, 1) };
        } else {
          throw new Error(`Unexpected decision ${request.kind}`);
        }
        queueMicrotask(() => {
          expect(
            destination!.applyIntent(seat, { type: "respondDecision", decisionId: request.decisionId, response }),
          ).toEqual({ ok: true });
        });
      },
    },
  });
  destination = restored.engine;
  const prefix = original.events.length;
  const intent = { type: "playCard", instanceId: original.inst("played").instanceId } as const;
  expect(original.engine.applyIntent(0, intent)).toEqual({ ok: true });
  expect(destination.applyIntent(0, intent)).toEqual({ ok: true });
  await Promise.all([
    waitForSnapshotBoundary({ engine: original.engine }),
    waitForSnapshotBoundary({ engine: destination }),
  ]);
  expect(original.perm("watcher").isSuspended).toBe(true);
  expect(original.perm("target").stack).toHaveLength(0);
  expect(destination.state.toJSON()).toEqual(original.state.toJSON());
  expect(events).toEqual(original.events.slice(prefix));
  expect(original.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  expect(destination.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  await Promise.all([running, restored.completion]);
  expect(events).toEqual(original.events.slice(prefix));
  expect(destination.state.toJSON()).toEqual(original.state.toJSON());
});

it("retains accepted event identity when the live subject later stops matching its printed filter", async () => {
  const original = setupEngine({
    0: {
      battleArea: [
        { card: "BT1-086", as: "watcher" },
        { card: "BT1-028", as: "subject" },
      ],
    },
  });
  await original.ready();
  const subscription = original.engine.subTriggers.subscriptionsFor("whenPlayed")[0]!;
  const subject = original.perm("subject");
  const trigger: TriggerInfo = { subjectPermanentId: subject.permanentId, subjectPermanentIds: [subject.permanentId] };
  const context = buildEffectContext(original.engine, cardSourceOf(original.engine, original.inst("watcher")), trigger);
  expect(subscription.matches!(context)).toBe(true);
  const snapshot = encodeRuntimeGraph({
    value: { state: original.state, subscription, context, trigger },
    references: original.engine.runtimeReferences,
    describeObject: (value) => original.engine.runtimeObjects.describe(value),
    describeCallback: (callback) => original.engine.runtimeCallbacks.describe(callback),
  });
  const objects = new RuntimeObjectRegistry();
  registerEngineSchemaFactories({ objects });
  const decoder = new RuntimeGraphDecoder({ snapshot: JSON.parse(JSON.stringify(snapshot)), objects });
  const state = decoder.decodeRootField({ key: "state" });
  expect(state).toBeInstanceOf(GameState);
  const destination = new GameEngine(state as GameState, { seed: 1, emit: () => {}, requestDecision: () => {} });
  decoder.bindRuntimePorts({
    objects: destination.runtimeObjects,
    references: destination.runtimeReferences,
    createCallback: (descriptor) => destination.runtimeCallbacks.create(descriptor),
  });
  const restored = decoder.decodeRoot() as {
    subscription: SubTriggerSubscription;
    context: EffectContext;
    trigger: TriggerInfo;
  };
  expect(restored.context.trigger).toBe(restored.trigger);
  destination.access.permanentById(subject.permanentId)!.topCard.cardId = "BT1-009";
  expect(restored.subscription.matches!(restored.context)).toBe(true);
  const later = buildEffectContext(destination, restored.context.source, { ...restored.trigger });
  expect(restored.subscription.matches!(later)).toBe(false);
  expect(subscription.matches!(context)).toBe(true);
});

it("validates matched-event history before replacing its weak identities", () => {
  const history = new MatchedTriggerHistory();
  const event: TriggerInfo = {};
  history.add(event);
  expect(() => history.restore([null])).toThrow("Invalid matched trigger history");
  expect(history.has(event)).toBe(true);
  expect(history.snapshot()).toEqual([event]);
  history.restore([]);
  expect(history.has(event)).toBe(false);
});
