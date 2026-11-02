import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT1-115.js";

describe("BT1-115 Veedramon", () => {
  it("matches the catalog and compiles both printed triggers", () => {
    expect(getCardDefinition("BT1-115")).toMatchObject({
      cardId: "BT1-115",
      set: "BT1",
      nameEn: "Veedramon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 6,
      dp: 6000,
      evoCosts: [{ color: "Blue", level: 3, memoryCost: 3 }],
      forms: ["Champion"],
      attributes: ["Vaccine"],
      types: ["Mythical Dragon"],
      effectText: "[When Attacking][Once Per Turn] If you have a Tamer in play, unsuspend this Digimon.",
      inheritedEffectText: "[All Turns] While you have a blue Tamer in play, this Digimon gets +1000 DP.",
      rarity: "SEC",
      maxCountInDeck: 4,
      imageId: "BT1-115",
      nameJp: "ブイドラモン",
    });
    expect(compiled).toEqual({
      effects: [
        {
          trigger: "WhenAttacking",
          frequency: "OncePerTurn",
          actions: [
            {
              kind: "Unsuspend",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              condition: { kind: "youHave", filter: { controller: "mine", kind: ["Tamer"] } },
            },
          ],
        },
        {
          trigger: "AllTurns",
          isInherited: true,
          actions: [
            {
              kind: "ModifyDP",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              amount: 1000,
              duration: "forTheTurn",
              condition: { kind: "youHave", filter: { controller: "mine", kind: ["Tamer"], colors: ["Blue"] } },
            },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("Q991 unsuspends once per turn when attacking while it controls a non-blue Tamer", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-115", as: "attacker", dp: 20000 }, "BT1-085"] },
      1: { security: ["BT1-010", "BT1-011"] },
    });
    const combat = s.engine as unknown as { combat: { isAttacking: boolean } };
    const attack = () =>
      s.engine.applyIntent(0, {
        type: "attack" as const,
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" as const },
      });
    expect(attack()).toEqual({ ok: true });
    await settle(
      () => !s.perm("attacker").isSuspended && s.state.players[1]!.security.length === 1 && !combat.combat.isAttacking,
    );
    expect(attack()).toEqual({ ok: true });
    await settle(() => s.perm("attacker").isSuspended && !combat.combat.isAttacking);
  });

  it("does not unsuspend when attacking without a Tamer", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-115", as: "attacker", dp: 20000 }] },
      1: { security: ["BT1-010"] },
    });
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);
    expect(s.perm("attacker").isSuspended).toBe(true);
  });

  it("resets the When Attacking allowance on the next own turn", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-115", as: "attacker" }, "BT1-085"], deck: ["BT1-009", "BT1-010"] },
        1: { security: ["BT1-010", "BT1-011", "BT1-012"], deck: ["BT1-013", "BT1-014"] },
      },
      { autoSelectCards: true },
    );
    const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
    const attack = () =>
      s.engine.applyIntent(0, {
        type: "attack" as const,
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" as const },
      });
    const firstTurn = s.engine.runOneTurn();
    await settle(() => mainPhase.isOpen);
    expect(attack()).toEqual({ ok: true });
    await settle(() => !s.perm("attacker").isSuspended);
    expect(attack()).toEqual({ ok: true });
    await settle(() => s.perm("attacker").isSuspended);
    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;

    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = -s.state.memory;
    const nextTurn = s.engine.runOneTurn();
    await settle(() => mainPhase.isOpen);
    expect(attack()).toEqual({ ok: true });
    await settle(() => !s.perm("attacker").isSuspended);
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextTurn;
  });

  it("Q992 gives only +1000 DP while 2 blue Tamers are in play", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-040", as: "host", dp: 7000, under: ["BT1-115"] }, "BT1-086", "BT1-086"],
      },
    });
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("host").currentDP).toBe(8000);

    s.state.turnSeat = 1;
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("host").currentDP).toBe(8000);
  });

  it("reaches Veedramon through a legal blue evolution stack and applies its inherited effect", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-028", as: "base" }, "BT1-086"],
        hand: [
          { card: "BT1-115", as: "veedramon" },
          { card: "BT1-040", as: "weregarurumon" },
        ],
        deck: [
          { card: "BT1-009", as: "drawn" },
          { card: "BT1-010", as: "drawn2" },
        ],
      },
    });
    s.state.memory = 6;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("veedramon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("veedramon").instanceId);
    expect(s.state.memory).toBe(3);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("weregarurumon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("weregarurumon").instanceId);
    expect(s.state.memory).toBe(0);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT1-028", "BT1-115"]);
    expect(s.perm("base").currentDP).toBe(8000);
  });

  it("rejects evolution from a non-blue level-3 source without changing cost or zones", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-009", as: "base" }], hand: [{ card: "BT1-115", as: "evolving" }] },
    });
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.state.memory).toBe(3);
    expect(s.perm("base").topCard.cardId).toBe("BT1-009");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("evolving").instanceId);
  });
});
