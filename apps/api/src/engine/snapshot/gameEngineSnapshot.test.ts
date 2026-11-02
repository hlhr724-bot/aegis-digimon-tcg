import { EffectTiming } from "@aegis/shared/schema/enums";
import { registerIrCard } from "#api/engine/effects/interpreter/registration/module";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter/compiledCards";
import { fireTimingForPermanent } from "#api/engine/gameEngine/timing/fire";
import { buildSubTriggerContext } from "#api/engine/gameEngine/subTriggers";
import { expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { setupEngine } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { SeededRandom } from "#api/engine/random/SeededRandom";
import { snapshotGameEngine } from "#api/engine/snapshot/snapshotGameEngine";
import { restoreGameEngine } from "#api/engine/snapshot/restoreGameEngine";

it("clones settled Main and produces the same future events, state, identities and random values", async () => {
  const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "attacker" }] } });
  setup.state.isFirstPlayersFirstTurn = true;
  setup.engine.randomStreams = [new SeededRandom({ seed: 41 }), new SeededRandom({ seed: 42 })];
  setup.engine.permanentSeq = 71;
  setup.engine.instanceSeq = 83;
  const running = setup.engine.turnMachine.runTurn();
  await advance(setup.engine).waitForMainPhase(0);
  setup.engine.deletionMaxDp.addOwnerWide(0, 2000);
  setup.engine.dpDeleteBudget.add("attacker", 3000);
  const snapshot = JSON.parse(JSON.stringify(snapshotGameEngine({ engine: setup.engine })));
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
  expect(events).toEqual([]);
  expect(restored.engine.state).not.toBe(setup.state);
  expect(restored.engine.state.toJSON()).toEqual(setup.state.toJSON());
  expect(restored.engine.mainPhase.isOpen).toBe(true);
  expect(restored.engine.permanentSeq).toBe(71);
  expect(restored.engine.instanceSeq).toBe(83);
  expect(restored.engine.deletionMaxDp.bonusFor(0)).toBe(2000);
  expect(restored.engine.dpDeleteBudget.bonusFor("attacker")).toBe(3000);
  expect(restored.engine.randomStreams?.map((random) => random.next())).toEqual(
    setup.engine.randomStreams.map((random) => random.next()),
  );
  const prefix = setup.events.length;
  expect(setup.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  expect(restored.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  await Promise.all([running, restored.completion]);
  expect(events).toEqual(setup.events.slice(prefix));
  expect(restored.engine.state.toJSON()).toEqual(setup.state.toJSON());
});

it("rejects incompatible code before constructing or emitting from the destination", () => {
  const events: ServerEvent[] = [];
  expect(() =>
    restoreGameEngine({
      snapshot: { version: 1, fingerprint: "different", graph: { version: 1, root: null, nodes: [] } },
      hooks: {
        seed: 1,
        emit: (event) => {
          events.push(event);
        },
        requestDecision: () => {},
      },
    }),
  ).toThrow("fingerprint");
  expect(events).toEqual([]);
});

it("restores delayed source history and executes its callback only against the destination", async () => {
  const cardId = "BT1-009";
  const saved = runtimeCompiledCard(cardId)!;
  try {
    registerIrCard(cardId, {
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
    });
    const setup = setupEngine({ 0: { battleArea: [{ card: cardId, as: "source" }], deck: ["BT1-019"] } });
    setup.state.isFirstPlayersFirstTurn = true;
    setup.engine.randomStreams = [new SeededRandom({ seed: 1 }), new SeededRandom({ seed: 2 })];
    const running = setup.engine.turnMachine.runTurn();
    await advance(setup.engine).waitForMainPhase(0);
    const historical = setup.perm("source");
    await fireTimingForPermanent(setup.engine, EffectTiming.OnPlay, historical, { playedSubject: historical });
    setup.state.players[0]!.battleArea.splice(0, 1);
    setup.state.players[0]!.trash.push(historical.topCard);
    const snapshot = JSON.parse(JSON.stringify(snapshotGameEngine({ engine: setup.engine })));
    const restored = restoreGameEngine({ snapshot, hooks: { seed: 1, emit: () => {}, requestDecision: () => {} } });
    const subscription = restored.engine.subTriggers.subscriptionsFor("endOfTurn")[0]!;
    const context = subscription.activationContext!;
    expect(context.game.state).toBe(restored.engine.state);
    expect(context.trigger.playedSubject).not.toBe(historical);
    expect(context.trigger.playedSubject?.topCard).toBe(restored.engine.state.players[0]!.trash[0]);
    expect(context.source.permanent()).toBeUndefined();
    try {
      restored.engine.state.turnSeat = 1;
      expect(
        await restored.engine.subTriggers.fire("endOfTurn", (sub) => buildSubTriggerContext(restored.engine, sub, {})),
      ).toBe(1);
      expect(restored.engine.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-019"]);
      expect(setup.state.players[0]!.hand).toHaveLength(0);
      expect(setup.engine.subTriggers.subscriptionsFor("endOfTurn")).toHaveLength(1);
    } finally {
      setup.state.gameOver = true;
      restored.engine.state.gameOver = true;
      setup.engine.mainPhase.abort();
      restored.engine.mainPhase.abort();
      await Promise.all([running, restored.completion]);
    }
  } finally {
    registerIrCard(cardId, saved);
  }
});
