import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle, settleAcrossTimers, type EngineSetup } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/option-use-cost-suspend-trigger-order.fixture";

function answer(s: EngineSetup, seat: 0 | 1, intent: Parameters<EngineSetup["engine"]["applyIntent"]>[1]) {
  expect(s.engine.applyIntent(seat, intent)).toEqual({ ok: true });
}

async function nextDecision(s: EngineSetup, previousDecisionId?: string) {
  await settleAcrossTimers(
    () => s.state.pendingDecision !== undefined && s.state.pendingDecision.decisionId !== previousDecisionId,
  );
  return s.decisions.at(-1)!.req;
}

describe("Option use-cost suspension triggers", () => {
  it("waits for the Option's [Main] effect and trashing before the opponent's suspension watcher activates", async () => {
    const s = setupScenario(fixture, { autoOrderTriggers: false });
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      answer(s, 0, { type: "endPhase" });
      await settle(() => s.state.phase === Phase.Main);
      answer(s, 0, { type: "playCard", instanceId: s.inst("tempest-option").instanceId, useAs: "option" });

      const reduce = await nextDecision(s);
      expect(reduce).toMatchObject({ seat: 0, kind: "optional", sourceCardId: "LM-066" });
      answer(s, 0, {
        type: "respondDecision",
        decisionId: reduce.decisionId,
        response: { kind: "optional", accept: true },
      });

      const suspendCost = await nextDecision(s, reduce.decisionId);
      expect(suspendCost).toMatchObject({ seat: 0, kind: "chooseTargets", sourceCardId: "LM-066" });
      answer(s, 0, {
        type: "respondDecision",
        decisionId: suspendCost.decisionId,
        response: {
          kind: "chooseTargets",
          instanceIds: [s.perm("own-cost-digimon").permanentId, s.perm("opponent-cost-digimon").permanentId],
        },
      });

      const bind = await nextDecision(s, suspendCost.decisionId);
      expect(bind).toMatchObject({ seat: 0, sourceCardId: "LM-066" });
      expect(s.perm("own-cost-digimon").isSuspended).toBe(true);
      expect(s.state.players[1]!.hand.map(({ cardId }) => cardId)).toEqual(["BT26-091"]);
      answer(s, 0, {
        type: "respondDecision",
        decisionId: bind.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("opponent-rosemon").permanentId] },
      });

      const returned = await nextDecision(s, bind.decisionId);
      expect(returned).toMatchObject({ seat: 0, sourceCardId: "LM-066" });
      answer(s, 0, {
        type: "respondDecision",
        decisionId: returned.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("opponent-cost-digimon").permanentId] },
      });

      const watcher = await nextDecision(s, returned.decisionId);
      expect(watcher).toMatchObject({ seat: 1, kind: "optional", sourceCardId: "BT26-049" });
      expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("LM-066");
      expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT26-049"]);
      answer(s, 1, {
        type: "respondDecision",
        decisionId: watcher.decisionId,
        response: { kind: "optional", accept: true },
      });
      await settleAcrossTimers(() => s.state.pendingDecision === undefined);
      expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT26-049", "BT26-091"]);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
