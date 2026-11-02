import { getCardDefinition, type AttackTarget } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT1-012.js";
import "./BT1-072.js";

describe("BT1-012 Biyomon", () => {
  it("matches the catalog and exports its inherited blocked boost", () => {
    expect(getCardDefinition("BT1-012")).toMatchObject({
      cardId: "BT1-012",
      nameEn: "Biyomon",
      colors: ["Red"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 2000,
      evoCosts: [{ color: "Red", level: 2, memoryCost: 0 }],
      forms: ["Rookie"],
      attributes: ["Vaccine"],
      types: ["Bird"],
      inheritedEffectText: "[Your Turn] When this Digimon is blocked, it gets +2000 DP.",
    });
    expect(getCardDefinition("BT1-012")?.effectText).toBeUndefined();
    expect(compiled.effects).toEqual([
      {
        trigger: "WhenBlocked",
        isInherited: true,
        condition: { kind: "isYourTurn" },
        actions: [
          {
            kind: "ModifyDP",
            amount: 2000,
            duration: "forTheTurn",
            effectSourceBound: true,
            target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          },
        ],
      },
    ]);
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
  });

  it("does not grant +2000 DP before an attack is actually blocked", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-016", as: "attacker", dp: 5000, under: ["BT1-012"] }] },
      1: { security: ["BT1-010"] },
    });
    await s.ready();
    expect(s.perm("attacker").currentDP).toBe(5000);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);
    expect(s.perm("attacker").currentDP).toBe(5000);
  });

  it("gives its Digimon +2000 DP when blocked during its turn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-016", as: "attacker", dp: 5000, under: ["BT1-012"] }] },
      1: { battleArea: [{ card: "BT1-072", as: "blocker", dp: 6000 }], security: ["BT1-010"] },
    });
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(
      s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.perm("attacker").currentDP).toBe(7000);
  });

  it("loses the +2000 DP boost when Biyomon is trashed from its digivolution cards", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-016", as: "attacker", dp: 5000, under: [{ card: "BT1-012", as: "biyomon" }] }] },
      1: { battleArea: [{ card: "BT1-072", as: "blocker", dp: 6000 }], security: ["BT1-010"] },
    });
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(
      s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("attacker").currentDP === 7000);

    await advance(s.engine).verb.trashDigivolutionCards(
      s.perm("attacker").permanentId,
      [s.inst("biyomon").instanceId],
      1,
    );

    expect(s.perm("attacker").currentDP).toBe(5000);
  });

  it("retains the inherited trigger when Biyomon is evolved onto a red level 2", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-001", as: "base" }],
        hand: [
          { card: "BT1-012", as: "biyomon" },
          { card: "BT1-016", as: "evolving" },
        ],
        deck: [{ card: "BT1-010", as: "drawn" }],
      },
      1: { battleArea: [{ card: "BT1-072", as: "blocker", dp: 1000 }], security: ["BT1-010"] },
    });
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("biyomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("biyomon").instanceId);
    expect(s.state.memory).toBe(3);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("evolving").instanceId);
    expect(s.state.memory).toBe(1);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(
      s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").currentDP === 6000);

    expect(s.perm("base").stack.map((card) => card.instanceId)).toContain(s.inst("base").instanceId);
    expect(s.perm("base").currentDP).toBe(6000);
  });
});

describe("BT1-012 Biyomon — KB Q&A rulings", () => {
  async function blockAttack(s: ReturnType<typeof setupEngine>, target: AttackTarget): Promise<void> {
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: s.perm("attacker").permanentId, target }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(
      s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId }),
    ).toEqual({ ok: true });
  }

  it("keeps the blocked +2000 DP until the end of the turn it activated (Q875)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-016", as: "attacker", dp: 5000, under: ["BT1-012"] }],
        hand: ["BT1-009"],
        deck: ["BT1-009", "BT1-013", "BT1-014"],
      },
      1: {
        battleArea: [{ card: "BT1-072", as: "blocker", dp: 1000 }],
        security: ["BT1-010"],
        deck: ["BT1-009", "BT1-013", "BT1-014"],
      },
    });
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    // A playable hand card keeps Main open after the attack instead of auto-passing the turn.
    s.state.memory = 3;

    await blockAttack(s, { kind: "player" });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(s.perm("attacker").currentDP).toBe(7000);

    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;

    expect(s.perm("attacker").currentDP).toBe(5000);
  });

  it("ends the +2000 DP when Biyomon is trashed from the digivolution cards (Q876)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT1-016", as: "attacker", dp: 5000, under: [{ card: "BT1-012", as: "biyomon" }, "BT1-013"] },
        ],
      },
      1: { battleArea: [{ card: "BT1-072", as: "blocker", dp: 1000 }], security: ["BT1-010"] },
    });
    await s.ready();

    await blockAttack(s, { kind: "player" });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(s.perm("attacker").currentDP).toBe(7000);

    await advance(s.engine).verb.trashDigivolutionCards(
      s.perm("attacker").permanentId,
      [s.inst("biyomon").instanceId],
      1,
    );

    expect(s.perm("attacker").stack.map((card) => card.cardId)).toEqual(["BT1-013"]);
    expect(s.perm("attacker").currentDP).toBe(5000);
  });

  it("does not activate when attacking an opponent's Digimon unless the attack is blocked (Q877)", async () => {
    function attackOpponentDigimon() {
      return setupEngine({
        0: { battleArea: [{ card: "BT1-016", as: "attacker", dp: 5000, under: ["BT1-012"] }] },
        1: {
          battleArea: [
            { card: "BT1-013", as: "target", dp: 6000, suspended: true },
            { card: "BT1-072", as: "blocker", dp: 6000 },
          ],
          security: ["BT1-010"],
        },
      });
    }

    const unblocked = attackOpponentDigimon();
    await unblocked.ready();
    const unblockedAttackerId = unblocked.perm("attacker").permanentId;
    expect(
      unblocked.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: unblockedAttackerId,
        target: { kind: "permanent", permanentId: unblocked.perm("target").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => unblocked.events.some((event) => event.kind === "blockWindowOpened"));
    expect(unblocked.engine.applyIntent(1, { type: "declineBlock" })).toEqual({ ok: true });
    await settle(() => unblocked.state.players[0]!.battleArea.length === 0);

    expect(unblocked.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId).sort()).toEqual(
      ["BT1-013", "BT1-072"].sort(),
    );

    const blocked = attackOpponentDigimon();
    await blocked.ready();
    await blockAttack(blocked, { kind: "permanent", permanentId: blocked.perm("target").permanentId });
    await settle(() => blocked.state.players[1]!.battleArea.length === 1);

    expect(blocked.perm("attacker").currentDP).toBe(7000);
    expect(blocked.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["BT1-013"]);
  });
});
