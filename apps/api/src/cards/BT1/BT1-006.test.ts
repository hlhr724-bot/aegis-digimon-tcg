import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT1-006.js";

describe("BT1-006 Cupimon", () => {
  it("matches the catalog and exports only its inherited security-count draw", () => {
    expect(getCardDefinition("BT1-006")).toMatchObject({
      cardId: "BT1-006",
      nameEn: "Cupimon",
      colors: ["Yellow"],
      kinds: ["DigiEgg"],
      level: 2,
      playCost: -1,
      dp: 0,
      evoCosts: [],
      forms: ["In-Training"],
      types: ["Mini Angel"],
      inheritedEffectText:
        "[When Attacking] If you have 5 or more security cards, trigger ＜Draw 1＞ (Draw 1 card from your deck).",
    });
    expect(getCardDefinition("BT1-006")?.effectText).toBeUndefined();
    expect(compiled.effects).toEqual([
      {
        trigger: "WhenAttacking",
        isInherited: true,
        actions: [
          {
            kind: "Draw",
            controller: "mine",
            amount: 1,
            condition: { kind: "zoneCount", seat: "mine", zone: "security", op: "gte", value: 5 },
          },
        ],
      },
    ]);
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
  });

  it("draws 1 when attacking with at least five security cards", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-052", as: "attacker", under: ["BT1-006"] }],
        security: ["BT1-045", "BT1-045", "BT1-045", "BT1-045", "BT1-045"],
        deck: [{ card: "BT1-010", as: "drawn" }],
      },
      1: { security: ["BT1-011"] },
    });
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.length === 1);
    expect(s.state.players[0]!.hand[0]!.instanceId).toBe(s.inst("drawn").instanceId);
  });

  it("does not draw when attacking with only four security cards", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-052", as: "attacker", under: ["BT1-006"] }],
        security: ["BT1-045", "BT1-045", "BT1-045", "BT1-045"],
        deck: [{ card: "BT1-010", as: "top" }],
      },
      1: { security: ["BT1-011"] },
    });
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(1);
  });

  it("carries the inherited draw through hatch -> breeding digivolve -> move beside a peer", async () => {
    const s = setupEngine(
      {
        0: {
          eggDeck: [{ card: "BT1-006", as: "egg" }],
          battleArea: [{ card: "BT1-045", as: "peer" }],
          hand: [{ card: "BT1-045", as: "kudamon" }],
          deck: [{ card: "BT1-010", as: "drawn" }, "BT1-011", "BT1-012", "BT1-013", "BT1-014"],
          security: ["BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014"],
        },
        1: {
          battleArea: [{ card: "BT1-046", as: "wall", suspended: true }],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
          security: ["BT1-009", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();

    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-006");
    const eggInstanceId = s.state.players[0]!.breeding!.topCard!.instanceId;
    const eggPermanentId = s.state.players[0]!.breeding!.permanentId;

    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: eggPermanentId,
        instanceId: s.inst("kudamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-045");
    expect(s.state.players[0]!.breeding!.stack.map(({ instanceId }) => instanceId)).toEqual([eggInstanceId]);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: eggPermanentId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2);

    await advance(s.engine).waitForMainPhase(0);
    const carrier = s.state.players[0]!.battleArea.find(({ stack }) =>
      stack.some(({ instanceId }) => instanceId === eggInstanceId),
    )!;
    expect(carrier.topCard?.cardId).toBe("BT1-045");
    const handBefore = s.state.players[0]!.hand.length;
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: carrier.permanentId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.length === handBefore + 1);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("drawn").instanceId);

    await advance(s.engine).verb.suspend([s.perm("wall").permanentId]);
    const peerHandLength = s.state.players[0]!.hand.length;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("peer").permanentId,
        target: { kind: "permanent", permanentId: s.perm("wall").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => !s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === s.perm("wall").permanentId),
    );
    expect(s.state.players[0]!.hand).toHaveLength(peerHandLength);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
