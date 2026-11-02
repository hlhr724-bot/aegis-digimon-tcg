import { describe, expect, it } from "vitest";
import type { Seat } from "@aegis/shared";
import { setupEngine, settle, drainMicrotasks, type EngineSetup } from "../../engine/testkit/harness.js";
import type { CounterContext } from "../policy.js";
import { buildBotView } from "../view.js";
import { createAsyncTrainingPolicy, type TrainingWindow } from "./policy.js";
import "../../cards/index.js";

function declineBlock(s: EngineSetup, seat: Seat): void {
  expect(s.engine.applyIntent(seat, { type: "declineBlock" })).toEqual({ ok: true });
}

async function openCounter(s: EngineSetup, attackingSeat: Seat): Promise<CounterContext> {
  expect(
    s.engine.applyIntent(attackingSeat, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await drainMicrotasks(500);
  if (s.engine.combat.hasOpenBlockWindow) {
    declineBlock(s, (1 - attackingSeat) as Seat);
  }
  await settle(() => s.events.some((event) => event.kind === "counterWindowOpened"));
  const opened = s.events.find((event) => event.kind === "counterWindowOpened");
  if (opened?.kind !== "counterWindowOpened") throw new Error("Counter did not open");
  return opened;
}

async function finishCombat(s: EngineSetup, defendingSeat: Seat): Promise<void> {
  await settle(() => !s.engine.combat.isAttacking || s.engine.combat.hasOpenBlockWindow);
  if (s.engine.combat.hasOpenBlockWindow) {
    declineBlock(s, defendingSeat);
  }
  await settle(() => !s.engine.combat.isAttacking && !s.engine.counterResolutionInFlight);
  expect(s.events.filter((event) => event.kind === "actionRejected")).toEqual([]);
  expect(s.state.pendingDecision).toBeUndefined();
}

for (const seat of [0, 1] as const) {
  describe(`visible Counter evolution materials for seat ${seat}`, () => {
    it.each([false, true])("preserves a printed Counter activation or decline, activate=%s", async (activate) => {
      const attackerSeat = (1 - seat) as Seat;
      const s = setupEngine(
        {
          [seat]: {
            battleArea: [{ card: "BT26-055", as: "source" }],
            hand: ["BT26-010"],
            security: ["BT1-010", "BT1-010"],
          },
          [attackerSeat]: { battleArea: [{ card: "BT1-013", as: "attacker" }], deck: ["BT1-010"] },
        },
        { autoDeclineOptional: true },
      );
      s.state.turnSeat = attackerSeat;
      s.state.memory = 3;
      await s.ready();
      const prompt = await openCounter(s, attackerSeat);
      expect(prompt.eligibleCounters).toHaveLength(1);
      const counter = prompt.eligibleCounters[0]!;
      const policy = createAsyncTrainingPolicy(s.engine, seat, async (window) => {
        expect(window.actions).toEqual([
          { intent: { type: "respondCounter" }, label: "Decline counter", targetId: prompt.attackerPermanentId },
          {
            intent: { type: "respondCounter", sourceInstanceId: counter.instanceId, effectKey: counter.effectKey },
            label: counter.description,
            sourceId: counter.instanceId,
            targetId: prompt.attackerPermanentId,
          },
        ]);
        return activate ? 1 : 0;
      });
      expect(
        s.engine.applyIntent(seat, await policy.chooseCounterResponse(buildBotView(s.state, seat)!, prompt)),
      ).toEqual({
        ok: true,
      });
      await finishCombat(s, seat);
      expect(s.events.find((event) => event.kind === "counterResolved")).toMatchObject({ activated: activate });
    });

    it.each(["a", "b"])("Blast Digivolves onto physical host %s with its inherited stack", async (host) => {
      const attackerSeat = (1 - seat) as Seat;
      const s = setupEngine(
        {
          [seat]: {
            battleArea: [
              { card: "EX13-042", as: "a", under: ["EX13-039"] },
              { card: "EX13-042", as: "b", under: ["EX13-040"] },
            ],
            hand: [{ card: "BT22-052", as: "ace" }],
            deck: ["BT1-010", "BT1-010"],
            security: ["BT1-010", "BT1-010"],
          },
          [attackerSeat]: { battleArea: [{ card: "BT1-013", as: "attacker" }], deck: ["BT1-010"] },
        },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      s.state.turnSeat = attackerSeat;
      s.state.memory = 3;
      await s.ready();
      const prompt = await openCounter(s, attackerSeat);
      let offered: TrainingWindow | undefined;
      const policy = createAsyncTrainingPolicy(s.engine, seat, async (window) => {
        offered = window;
        return window.actions.findIndex((action) => action.materialIds?.[0] === s.perm(host).permanentId);
      });
      const response = await policy.chooseCounterResponse(buildBotView(s.state, seat)!, prompt);
      expect(offered!.actions.slice(1).map((action) => action.materialIds)).toEqual([
        [s.perm("a").permanentId],
        [s.perm("b").permanentId],
      ]);
      expect(offered!.actions.slice(1).map((action) => action.targetId)).toEqual([
        s.perm("attacker").permanentId,
        s.perm("attacker").permanentId,
      ]);
      expect(s.engine.applyIntent(seat, response)).toEqual({ ok: true });
      await finishCombat(s, seat);
      expect(s.perm(host).topCard.cardId).toBe("BT22-052");
      expect(s.perm(host).stack.map((card) => card.cardId)).toEqual([
        host === "a" ? "EX13-039" : "EX13-040",
        "EX13-042",
      ]);
      expect(s.perm(host === "a" ? "b" : "a").topCard.cardId).toBe("EX13-042");
      expect(s.state.memory).toBe(3);
      expect(s.state.players[seat]!.deck).toHaveLength(1);
    });

    it.each([false, true])("Blast DNA preserves physical material order, hand below=%s", async (handBelow) => {
      const attackerSeat = (1 - seat) as Seat;
      const fieldCard = handBelow ? "BT20-044" : "EX13-021";
      const underCard = handBelow ? "BT20-042" : "EX13-018";
      const handCard = handBelow ? "BT20-027" : "BT20-044";
      const s = setupEngine(
        {
          [seat]: {
            battleArea: [
              { card: fieldCard, as: "a", under: [underCard] },
              { card: fieldCard, as: "b", under: [underCard] },
            ],
            hand: [
              { card: handCard, as: "hand-a" },
              { card: handCard, as: "hand-b" },
              { card: "BT20-045", as: "ace" },
            ],
            deck: ["BT1-010", "BT1-010"],
            security: ["BT1-010", "BT1-010"],
          },
          [attackerSeat]: { battleArea: [{ card: "BT1-013", as: "attacker" }], deck: ["BT1-010"] },
        },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      s.state.turnSeat = attackerSeat;
      s.state.memory = 3;
      await s.ready();
      const fieldId = s.perm("b").permanentId;
      const handId = s.inst("hand-b").instanceId;
      const stackIds = [...s.perm("b").stack, s.perm("b").topCard].map((card) => card.instanceId);
      const expectedMaterials = handBelow ? [handId, fieldId] : [fieldId, handId];
      const expectedStack = handBelow ? [handId, ...stackIds] : [...stackIds, handId];
      const prompt = await openCounter(s, attackerSeat);
      let offered: TrainingWindow | undefined;
      const policy = createAsyncTrainingPolicy(s.engine, seat, async (window) => {
        offered = window;
        return window.actions.findIndex(
          (action) => JSON.stringify(action.materialIds) === JSON.stringify(expectedMaterials),
        );
      });
      const response = await policy.chooseCounterResponse(buildBotView(s.state, seat)!, prompt);
      const routes = offered!.actions.filter((action) => action.sourceId === s.inst("ace").instanceId);
      expect(routes).toHaveLength(4);
      expect(new Set(routes.map((action) => JSON.stringify(action.materialIds))).size).toBe(4);
      expect(s.engine.applyIntent(seat, response)).toEqual({ ok: true });
      await finishCombat(s, seat);
      const merged = s.state.players[seat]!.battleArea.find((unit) => unit.topCard.cardId === "BT20-045")!;
      expect(merged.stack.map((card) => card.instanceId)).toEqual(expectedStack);
      expect(s.state.players[seat]!.battleArea.some((unit) => unit.permanentId === fieldId)).toBe(false);
      expect(s.perm("a").topCard.cardId).toBe(fieldCard);
      expect(s.state.players[seat]!.hand.some((card) => card.instanceId === s.inst("hand-a").instanceId)).toBe(true);
      expect(s.state.players[seat]!.hand.some((card) => card.instanceId === handId)).toBe(false);
      expect(s.state.memory).toBe(3);
      expect(s.state.players[seat]!.deck).toHaveLength(1);
    });
  });
}
