import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/index";

describe("KausGammamon protection, suspension lock and inherited Evade", () => {
  it.each(["BT8-008", "EX12-005", "BT1-009"])("protects only Gammamon text or VB targets: %s", async (target) => {
    const s = setupEngine(
      { 0: { hand: [{ card: "BT27-023", as: "kaus" }], battleArea: [{ card: target, as: "target" }] } },
      { autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 8;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kaus").instanceId })).toEqual({ ok: true });
    await settle(
      () =>
        s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "BT27-023") && !s.state.pendingDecision,
    );
    expect(observe(s.engine).hasRestriction(s.perm("target"), "beDeletedInBattle")).toBe(target !== "BT1-009");
  });

  it.each(["BT1-060", "BT1-084"])("locks only level five or lower on attack: %s", async (target) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-023", as: "kaus" }] }, 1: { battleArea: [{ card: target, as: "target" }] } },
      { autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm("kaus"));
    expect(observe(s.engine).hasRestriction(s.perm("target"), "suspend")).toBe(target === "BT1-060");
  });

  it.each(["BT8-008", "EX12-005", "BT1-009"])(
    "accepts only named Gammamon or level three VB alternate evolution: %s",
    async (base) => {
      const s = setupEngine({
        0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: "BT27-023", as: "kaus" }], deck: ["BT1-009"] },
      });
      await s.ready();
      s.state.memory = 5;
      const result = s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("kaus").instanceId,
        useAlternateCost: true,
      });
      expect(result.ok).toBe(base !== "BT1-009");
      if (!result.ok) {
        return;
      }
      await settle(() => s.perm("base").topCard.cardId === "BT27-023" && !s.state.pendingDecision);
      expect(s.state.memory).toBe(3);
      expect(s.perm("base").stack.map((card) => card.cardId)).toContain(base);
    },
  );

  it("grants Evade to an evolved host", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-060", as: "host", under: ["BT27-023"] }] } });
    await s.ready();
    expect([...s.perm("host").keywords]).toContain("Evade");
  });
  it("preserves Evade through a legal Gammamon evolution stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT8-008", as: "base" }],
          hand: [
            { card: "BT27-023", as: "champion" },
            { card: "EX12-014", as: "ultimate" },
          ],
          deck: ["BT1-009", "BT1-011", "BT1-012"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "defender", dp: 1000, suspended: true }],
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
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT8-008", "BT27-023"]);
    expect([...s.perm("base").keywords]).toContain("Evade");
  });
});
