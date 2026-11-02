import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle, settleAcrossTimers, type EngineSetup } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/play-cost-trash-trigger-order.fixture";

function answer(s: EngineSetup, seat: 0 | 1, intent: Parameters<EngineSetup["engine"]["applyIntent"]>[1]) {
  expect(s.engine.applyIntent(seat, intent)).toEqual({ ok: true });
}

async function nextDecision(s: EngineSetup, previousDecisionId?: string) {
  await settleAcrossTimers(
    () => s.state.pendingDecision !== undefined && s.state.pendingDecision.decisionId !== previousDecisionId,
  );
  return s.decisions.at(-1)!.req;
}

function fieldCardIds(s: EngineSetup, seat: 0 | 1) {
  return s.state.players[seat]!.battleArea.map(({ topCard }) => topCard.cardId);
}

describe("Play-cost trash triggers", () => {
  it("joins the played card's [On Play] batch instead of activating before the play", async () => {
    const s = setupScenario(fixture, { autoOrderTriggers: false });
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      answer(s, 0, { type: "endPhase" });
      await settle(() => s.state.phase === Phase.Main);
      answer(s, 0, { type: "playCard", instanceId: s.inst("played-digimon").instanceId });

      const reduce = await nextDecision(s);
      expect(reduce).toMatchObject({ seat: 0, kind: "optional" });
      answer(s, 0, {
        type: "respondDecision",
        decisionId: reduce.decisionId,
        response: { kind: "optional", accept: true },
      });

      const order = await nextDecision(s, reduce.decisionId);
      expect(order).toMatchObject({ seat: 0, kind: "orderTriggers" });
      expect(JSON.parse(s.state.pendingDecision!.payloadJson)).toMatchObject({
        triggerCardIds: ["BT25-049", "BT26-049"],
      });
      expect(fieldCardIds(s, 0)).toEqual(["BT26-049", "BT25-088", "BT25-049"]);
      expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(
        s.inst("cost-tamer-face-down-card").instanceId,
      );
      expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT26-091");
      answer(s, 0, {
        type: "respondDecision",
        decisionId: order.decisionId,
        response: { kind: "orderTriggers", order: [], orderIndexes: [1, 0] },
      });

      const watcher = await nextDecision(s, order.decisionId);
      expect(watcher).toMatchObject({ seat: 0, kind: "optional", sourceCardId: "BT26-049" });
      answer(s, 0, {
        type: "respondDecision",
        decisionId: watcher.decisionId,
        response: { kind: "optional", accept: true },
      });

      const onPlay = await nextDecision(s, watcher.decisionId);
      expect(onPlay).toMatchObject({ seat: 0, kind: "chooseTargets", sourceCardId: "BT25-049" });
      expect(fieldCardIds(s, 0)).toEqual(["BT26-049", "BT25-088", "BT25-049", "BT26-091"]);
      answer(s, 0, {
        type: "respondDecision",
        decisionId: onPlay.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("opponent-digimon").permanentId] },
      });

      await settleAcrossTimers(() => s.state.pendingDecision === undefined);
      expect(fieldCardIds(s, 0)).toEqual(["BT26-049", "BT25-088", "BT25-049", "BT26-091"]);
      expect(s.perm("opponent-digimon").isSuspended).toBe(true);
      expect(s.perm("cost-tamer").stack).toHaveLength(0);
      expect(s.state.memory).toBe(7);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
