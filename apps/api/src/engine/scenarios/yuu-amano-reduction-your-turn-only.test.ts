import "#api/cards/index";
import { describe, expect, it } from "vitest";
import yuuAmanoOpponentTurnFixture from "#api/engine/scenarios/yuu-amano-reduction-your-turn-only.fixture";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("Yuu Amano's [Your Turn] play cost reduction", () => {
  it("is not offered when a [Bagra Army] Digimon is played during the opponent's turn", async () => {
    const s = setupScenario(yuuAmanoOpponentTurnFixture, { autoAcceptOptional: true, autoSelectCards: true });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(1);
      expect(
        s.engine.applyIntent(1, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "permanent", permanentId: s.perm("darkKnightmon").permanentId },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          !observe(s.engine).isAttacking() &&
          s.state.pendingDecision === undefined &&
          s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.instanceId === s.inst("damemon").instanceId),
        5000,
      );

      const damemon = s.state.players[0]!.battleArea.find(
        ({ topCard }) => topCard?.instanceId === s.inst("damemon").instanceId,
      );
      expect(damemon).toBeDefined();
      expect(s.decisions.filter(({ req }) => (req.promptText ?? "").includes("BT10-093"))).toEqual([]);
      expect(damemon?.stack).toHaveLength(0);
      expect(s.perm("yuu").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("purpleUnderYuu").instanceId]);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
