import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../BT3/BT3-046.js";
import { compiled } from "./BT1-058.js";

describe("BT1-058 Chirinmon", () => {
  it("matches the catalog and exact delayed-memory IR contract", () => {
    expect(getCardDefinition("BT1-058")).toMatchObject({
      cardId: "BT1-058",
      set: "BT1",
      nameEn: "Chirinmon",
      colors: ["Yellow"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 6,
      dp: 7000,
      evoCosts: [{ color: "Yellow", level: 4, memoryCost: 3 }],
      forms: ["Ultimate"],
      attributes: ["Vaccine"],
      types: ["Holy Beast"],
      effectText: "[When Attacking] Gain 3 memory. At end of turn, lose 3 memory.",
      rarity: "U",
      maxCountInDeck: 4,
      imageId: "BT1-058",
      nameJp: "チィリンモン",
    });
    expect(getCardDefinition("BT1-058")?.inheritedEffectText).toBeUndefined();
    expect(getCardDefinition("BT1-058")?.securityEffectText).toBeUndefined();
    expect(compiled).toEqual({
      effects: [
        {
          trigger: "WhenAttacking",
          actions: [
            { kind: "GainMemory", amount: 3 },
            { kind: "GainMemory", amount: -3, at: "endOfTurn" },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("gains 3 memory when attacking", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-058", as: "attacker" }] }, 1: { security: ["BT1-010"] } });
    s.state.memory = 0;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.memory === 3);
    expect(s.state.memory).toBe(3);
  });

  it("still loses 3 at the real turn end after Chirinmon is deleted (Q917)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-058", as: "attacker" }], deck: ["BT1-010"], hand: ["BT1-010"] },
      1: { security: ["BT1-025"], deck: ["BT1-010"], hand: ["BT1-010"] },
    });
    const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
    const turn = s.engine.runOneTurn();
    await settle(() => mainPhase.isOpen);
    s.state.memory = 0;
    const attackerId = s.perm("attacker").permanentId;
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: attackerId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.memory === 3 && !s.state.players[0]!.battleArea.some((p) => p.permanentId === attackerId),
    );
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    expect(s.state.memory).toBe(-6);
  });

  it("moves to the opponent side on pass, then loses 3 more at turn end (Q918)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-058", as: "attacker" }], deck: ["BT1-010"], hand: ["BT1-010"] },
      1: { security: ["BT1-010"], deck: ["BT1-010"] },
    });
    const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
    const turn = s.engine.runOneTurn();
    await settle(() => mainPhase.isOpen);
    s.state.memory = 0;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.memory === 3 && s.state.players[1]!.security.length === 0);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    expect(s.state.memory).toBe(-6);
  });

  it("still pays the specified loss when Terriermon prevents the gain (Q1080/Q1087/Q1097/Q1415)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-058", as: "attacker" }], deck: ["BT1-010"], hand: ["BT1-010"] },
      1: {
        battleArea: [{ card: "BT3-046", as: "terriermon" }],
        security: ["BT1-010"],
        deck: ["BT1-010"],
        hand: ["BT1-010"],
      },
    });
    const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
    const turn = s.engine.runOneTurn();
    await settle(() => mainPhase.isOpen);
    s.state.memory = 0;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);
    expect(s.state.memory).toBe(0);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    expect(s.state.memory).toBe(-6);
  });

  it("gains memory when the evolved Chirinmon attacks", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-056", as: "base" }],
        hand: [{ card: "BT1-058", as: "chirinmon" }],
        deck: [{ card: "BT1-010", as: "evolutionDraw" }],
      },
      1: { security: ["BT1-010"] },
    });
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("chirinmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("chirinmon").instanceId);
    expect(s.state.memory).toBe(0);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT1-056"]);
    expect(s.state.players[0]!.hand[0]!.instanceId).toBe(s.inst("evolutionDraw").instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.memory === 3);
    expect(s.state.memory).toBe(3);
  });

  it("rejects evolution from a red level 4", () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-014", as: "redBase" }], hand: [{ card: "BT1-058", as: "chirinmon" }] },
    });
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("redBase").permanentId,
        instanceId: s.inst("chirinmon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });
});
