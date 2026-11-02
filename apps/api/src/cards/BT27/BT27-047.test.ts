import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

describe("WezenGammamon suspension, attack power and inherited Piercing", () => {
  it.each([EffectTiming.OnPlay, EffectTiming.WhenMoving])(
    "suspends an opponent's Digimon at timing %s",
    async (timing) => {
      const s = setupEngine(
        {
          0: { battleArea: [{ card: "BT27-047", as: "wezen" }] },
          1: { battleArea: [{ card: "BT1-009", as: "target" }] },
        },
        { autoSelectCards: true },
      );
      await s.ready();
      await advance(s.engine).fireForPermanent(timing, s.perm("wezen"));
      expect(s.perm("target").isSuspended).toBe(true);
      expect(s.perm("wezen").isSuspended).toBe(false);
    },
  );

  it("gains five thousand DP only once per turn", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT27-047", as: "wezen" }] } });
    await s.ready();
    await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm("wezen"));
    expect(s.perm("wezen").currentDP).toBe(10000);
    await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm("wezen"));
    expect(s.perm("wezen").currentDP).toBe(10000);
  });

  it.each(["BT8-008", "EX12-005", "BT1-009"])(
    "uses the alternate route only for Gammamon or level three VB: %s",
    async (base) => {
      const s = setupEngine({
        0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: "BT27-047", as: "wezen" }], deck: ["BT1-009"] },
      });
      await s.ready();
      s.state.memory = 5;
      const result = s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("wezen").instanceId,
        useAlternateCost: true,
      });
      expect(result.ok).toBe(base !== "BT1-009");
      if (!result.ok) {
        return;
      }
      await settle(() => s.perm("base").topCard.cardId === "BT27-047" && !s.state.pendingDecision);
      expect(s.state.memory).toBe(3);
      expect(s.perm("base").stack.map((card) => card.cardId)).toContain(base);
    },
  );

  it("grants Piercing to an evolved host", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-060", as: "host", under: ["BT27-047"] }] } });
    await s.ready();
    expect([...s.perm("host").keywords]).toContain("Piercing");
  });
  it("preserves Piercing through a legal Gammamon evolution stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT8-008", as: "base" }],
          hand: [
            { card: "BT27-047", as: "champion" },
            { card: "EX12-014", as: "ultimate" },
          ],
          deck: ["BT1-009", "BT1-011", "BT1-012"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "defender", dp: 4000, suspended: true }],
          security: ["BT1-009", "BT1-011"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    for (const alias of ["champion", "ultimate"]) {
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst(alias).instanceId,
          useAlternateCost: true,
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.perm("base").topCard.instanceId === s.inst(alias).instanceId &&
          !s.state.pendingDecision &&
          s.engine.mainVerbContinuationsInFlight === 0,
      );
    }
    expect(s.state.memory).toBe(5);
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT8-008", "BT27-047"]);
    expect([...s.perm("base").keywords]).toContain("Piercing");
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).finishAttack();
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });
});
