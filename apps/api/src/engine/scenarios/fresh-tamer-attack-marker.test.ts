import { Phase } from "@aegis/shared/schema/enums";
import { describe, expect, it } from "vitest";
import "#api/cards/BT12/BT12-088";
import "#api/cards/BT4/BT4-011";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/fresh-tamer-attack-marker.fixture";

describe("Fresh Tamer attack marker", () => {
  it("distinguishes a newly played Tamer before and after its Hybrid evolution", async () => {
    const s = setupScenario(fixture);
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      const freshInstanceId = s.inst("freshTamer").instanceId;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: freshInstanceId })).toEqual({ ok: true });
      await settle(() =>
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === freshInstanceId),
      );
      await advance(s.engine).waitForMainPhase(0);
      expect(s.perm("freshTamer").summoningSick).toBe(true);
      expect(s.perm("establishedTamer").summoningSick).toBe(false);
      for (const [base, evolution] of [
        ["freshTamer", "freshHybrid"],
        ["establishedTamer", "establishedHybrid"],
      ] as const) {
        expect(
          s.engine.applyIntent(0, {
            type: "digivolve",
            permanentId: s.perm(base).permanentId,
            instanceId: s.inst(evolution).instanceId,
            useAlternateCost: true,
          }),
        ).toEqual({ ok: true });
        await settle(() => s.perm(base).topCard.cardId === "BT4-011");
        await advance(s.engine).waitForMainPhase(0);
      }
      expect(s.perm("freshTamer").summoningSick).toBe(true);
      expect(s.perm("freshTamer").canAttackPlayer).toBe(false);
      expect(s.perm("establishedTamer").summoningSick).toBe(false);
      expect(s.perm("establishedTamer").canAttackPlayer).toBe(true);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("freshTamer").permanentId,
          target: { kind: "player" },
        }).ok,
      ).toBe(false);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
