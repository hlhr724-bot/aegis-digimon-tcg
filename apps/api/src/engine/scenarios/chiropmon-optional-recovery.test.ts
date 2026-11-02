import { Phase } from "@aegis/shared/schema/enums";
import { describe, expect, it } from "vitest";
import "#api/cards/ST23/ST23-12";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import { chiropmonOptionalRecovery } from "#api/engine/scenarios/chiropmon-optional-recovery.fixture";

describe("Chiropmon optional recovery after payment", () => {
  it("can pay the face-down Tamer cost and decline the recovery", async () => {
    const s = setupScenario(chiropmonOptionalRecovery);
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("chiropmon").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.pendingDecision?.kind === "optional");
      const cost = s.decisions.at(-1)!.req;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: cost.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });
      await settle(
        () => s.state.pendingDecision?.kind === "optional" && s.state.pendingDecision.decisionId !== cost.decisionId,
      );
      const recovery = s.decisions.at(-1)!.req;
      expect(recovery.promptText).toContain("Return");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: recovery.decisionId,
          response: { kind: "optional", accept: false },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision === undefined);
      expect(s.perm("tamer").stack).toHaveLength(0);
      expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
        expect.arrayContaining([s.inst("payment").instanceId, s.inst("recovery").instanceId]),
      );
      expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-010"]);
      expect(s.state.memory).toBe(3);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
