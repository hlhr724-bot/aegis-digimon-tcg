import { describe, expect, it } from "vitest";
import { EffectDuration, type FieldEffectView } from "@aegis/shared";
import { advance } from "../testkit/advance.js";
import { setupEngine } from "../testkit/harness.js";
import "../../cards/index.js";

describe("a DP reduction held back by effect immunity", () => {
  function setup() {
    return setupEngine({
      0: { battleArea: [{ card: "BT1-011", as: "protected", dp: 6000 }] },
      1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
    });
  }

  async function opponentDigimonModifyDp(
    s: ReturnType<typeof setupEngine>,
    permanentId: string,
    delta: number,
    duration: EffectDuration,
  ): Promise<void> {
    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    try {
      await advance(s.engine).verb.modifyDP(permanentId, delta, duration);
    } finally {
      advance(s.engine).verb.leaveEffectResolution();
    }
  }

  function heldDpEffects(s: ReturnType<typeof setupEngine>): FieldEffectView[] {
    const json = s.perm("protected").heldDpEffectsJson;
    return json ? (JSON.parse(json) as FieldEffectView[]) : [];
  }

  it("publishes the blocked reduction and when it expires", async () => {
    const s = setup();
    await s.ready();
    const protectedId = s.perm("protected").permanentId;
    await advance(s.engine).verb.restrict(protectedId, "beAffected", EffectDuration.UntilEachTurnEnd, {
      fromSourceKind: ["Digimon"],
    });

    await opponentDigimonModifyDp(s, protectedId, -3000, EffectDuration.UntilOwnerTurnEnd);
    await s.engine.recomputeContinuousEffects();

    expect(s.perm("protected").currentDP).toBe(6000);
    expect(heldDpEffects(s)).toEqual([
      expect.objectContaining({
        kind: "dp",
        value: -3000,
        duration: EffectDuration.UntilOpponentTurnEnd,
        ownerSeat: 0,
      }),
    ]);
  });

  it("clears the held reduction once the protection ends and the DP applies", async () => {
    const s = setup();
    await s.ready();
    const protectedId = s.perm("protected").permanentId;
    await opponentDigimonModifyDp(s, protectedId, -3000, EffectDuration.Permanent);
    await advance(s.engine).verb.restrict(protectedId, "beAffected", EffectDuration.UntilEachTurnEnd, {
      fromSourceKind: ["Digimon"],
    });
    await s.engine.recomputeContinuousEffects();
    expect(heldDpEffects(s)).toHaveLength(1);

    await advance(s.engine).runTurn(0);

    expect(s.perm("protected").currentDP).toBe(3000);
    expect(heldDpEffects(s)).toEqual([]);
  });

  it("publishes nothing for a reduction that already applies", async () => {
    const s = setup();
    await s.ready();

    await opponentDigimonModifyDp(s, s.perm("protected").permanentId, -3000, EffectDuration.UntilEachTurnEnd);
    await s.engine.recomputeContinuousEffects();

    expect(s.perm("protected").currentDP).toBe(3000);
    expect(heldDpEffects(s)).toEqual([]);
  });
});
