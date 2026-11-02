import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/kurata-deletion-continues-after-source-placement.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

it.each(["first-target", "second-target"])(
  "Kurata completes deletion after moving under Belphemon: %s",
  async (target) => {
    const s = setupScenario(fixture, { autoAcceptOptional: true });
    const kurataInstanceId = s.perm("original-kurata").topCard.instanceId;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(1);
      expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
      const request = s.decisions.find(({ req }) => req.decisionId === s.state.pendingDecision!.decisionId)!.req;
      expect(request).toMatchObject({
        sourceCardId: "BT13-103",
        sourceInstanceId: kurataInstanceId,
        sourcePermanentId: s.perm("belphemon").permanentId,
        options: { targetFate: "delete" },
      });
      expect(s.perm("belphemon").stack.map((card) => card.instanceId)).toContain(kurataInstanceId);
      expect(s.perm("other-kurata").topCard.cardId).toBe("EX10-066");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "chooseTargets", instanceIds: [s.perm("other-kurata").permanentId] },
        }).ok,
      ).toBe(false);
      const targetId = s.perm(target).permanentId;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "chooseTargets", instanceIds: [targetId] },
        }),
      ).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === targetId)).toBe(false);
      expect(s.state.pendingDecision).toBeUndefined();
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  },
);
