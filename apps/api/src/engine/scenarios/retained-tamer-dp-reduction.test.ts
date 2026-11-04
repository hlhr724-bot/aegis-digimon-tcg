import { describe, expect, it } from "vitest";
import { EffectDuration } from "@aegis/shared/schema/enums";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/BT4/BT4-011";
import "#api/cards/BT4/BT4-092";

describe("DP reduction retained by a Tamer after De-Digivolve", () => {
  it("projects the reduction while the Tamer has no DP and reapplies it after digivolving", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT4-011", as: "hybrid", under: ["BT4-092"] }],
        hand: [{ card: "BT4-011", as: "nextHybrid" }],
      },
    });
    await s.ready();
    const id = s.perm("hybrid").permanentId;
    await advance(s.engine).verb.modifyDP(id, -3000, EffectDuration.UntilEachTurnEnd);
    expect(s.perm("hybrid").currentDP).toBe(2000);
    await advance(s.engine).verb.deDigivolve(id, 1);
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("hybrid").topCard.cardId).toBe("BT4-092");
    expect(s.perm("hybrid").currentDP).toBe(0);
    expect(s.perm("hybrid").retainedDpDelta).toBe(-3000);
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: id,
        instanceId: s.inst("nextHybrid").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("hybrid").topCard.cardId === "BT4-011" && !s.state.pendingDecision);
    expect(s.perm("hybrid").currentDP).toBe(2000);
    expect(s.perm("hybrid").retainedDpDelta).toBe(0);
  });

  it("clears the retained indicator when the duration expires", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT4-011", as: "hybrid", under: ["BT4-092"] }] } });
    await s.ready();
    const id = s.perm("hybrid").permanentId;
    await advance(s.engine).verb.modifyDP(id, -3000, EffectDuration.UntilEachTurnEnd);
    await advance(s.engine).verb.deDigivolve(id, 1);
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("hybrid").retainedDpDelta).toBe(-3000);
    await advance(s.engine).runTurn(0);
    expect(s.perm("hybrid").retainedDpDelta).toBe(0);
  });
});
