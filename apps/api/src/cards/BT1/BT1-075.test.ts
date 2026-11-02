import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../BT3/BT3-046.js";
import { compiled } from "./BT1-075.js";

describe("BT1-075 Digitamamon", () => {
  it("matches the catalog and When Attacking IR contract", () => {
    expect(getCardDefinition("BT1-075")).toMatchObject({
      cardId: "BT1-075",
      set: "BT1",
      nameEn: "Digitamamon",
      colors: ["Green"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 6,
      dp: 7000,
      evoCosts: [{ color: "Green", level: 4, memoryCost: 3 }],
      forms: ["Ultimate"],
      attributes: ["Data"],
      types: ["Perfect"],
      rarity: "C",
      maxCountInDeck: 4,
      imageId: "BT1-075",
      nameJp: "デジタマモン",
    });
    expect(getCardDefinition("BT1-075")?.effectText).toBe(
      "[When Attacking] Gain 3 memory. At end of turn, lose 3 memory.",
    );
    expect(getCardDefinition("BT1-075")?.inheritedEffectText).toBeUndefined();
    expect(getCardDefinition("BT1-075")?.securityEffectText).toBeUndefined();
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

  it("evolves from a green level 4 and preserves the source stack", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-074", as: "base" }],
        hand: [{ card: "BT1-075", as: "digitamamon" }],
        deck: ["BT1-009"],
      },
    });
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("digitamamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("digitamamon").instanceId);

    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT1-074"]);
    expect(s.perm("base")).toMatchObject({ baseDP: 7000, currentDP: 7000 });
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT1-009")).toBe(true);
  });

  it("gains 3 memory when attacking", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-075", as: "attacker" }] }, 1: { security: ["BT1-010"] } });
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

  it("pays the delayed 3 after Digitamamon is deleted, in addition to passing at 3 memory", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-075", as: "attacker" }] }, 1: { security: ["BT1-062"] } });
    const attackerId = s.perm("attacker").permanentId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.memory === 3 &&
        !s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === attackerId),
    );

    await advance(s.engine).runTurn(0);

    expect(s.state.memory).toBe(-6);
  });

  it("still loses 3 when Terriermon blocks the gain (Q1080/Q1087/Q1097)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-075", as: "attacker" }], deck: ["BT1-009"], hand: ["BT1-009"] },
      1: {
        battleArea: [{ card: "BT3-046", as: "terriermon" }],
        security: ["BT1-010"],
        deck: ["BT1-009"],
        hand: ["BT1-009"],
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

  it("rejects evolution from a red level 4", () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-016", as: "redBase" }], hand: [{ card: "BT1-075", as: "digitamamon" }] },
    });

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("redBase").permanentId,
        instanceId: s.inst("digitamamon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });
});

describe("BT1-075 Digitamamon — KB Q&A rulings", () => {
  async function attackInMainPhase(opponentSecurity: string) {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-075", as: "digitamamon" }],
        hand: [{ card: "BT1-068", as: "kokuwamon" }],
        deck: ["BT1-009"],
      },
      1: { security: [opponentSecurity], deck: ["BT1-009"] },
    });
    const digitamamonId = s.perm("digitamamon").permanentId;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 0;
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: digitamamonId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await advance(s.engine).finishAttack();
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.memory).toBe(3);
    const digitamamonSurvived = s.state.players[0]!.battleArea.some(
      (permanent) => permanent.permanentId === digitamamonId,
    );
    return { s, turn, digitamamonSurvived };
  }

  it("still loses 3 memory at end of turn after Digitamamon is deleted by the attack (Q925)", async () => {
    const deleted = await attackInMainPhase("BT1-062");
    expect(deleted.digitamamonSurvived).toBe(false);
    expect(
      deleted.s.engine.applyIntent(0, { type: "playCard", instanceId: deleted.s.inst("kokuwamon").instanceId }),
    ).toEqual({ ok: true });
    await deleted.turn;
    expect(deleted.s.state.memory).toBe(-4);

    const survived = await attackInMainPhase("BT1-049");
    expect(survived.digitamamonSurvived).toBe(true);
    expect(
      survived.s.engine.applyIntent(0, { type: "playCard", instanceId: survived.s.inst("kokuwamon").instanceId }),
    ).toEqual({ ok: true });
    await survived.turn;
    expect(survived.s.state.memory).toBe(-4);
  });

  it("ends at 6 on the opponent's side when passing after gaining 3 memory (Q926)", async () => {
    const { s, turn, digitamamonSurvived } = await attackInMainPhase("BT1-049");
    expect(digitamamonSurvived).toBe(true);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    expect(s.state.memory).toBe(-6);

    const control = setupEngine({
      0: { battleArea: [{ card: "BT1-075", as: "digitamamon" }], deck: ["BT1-009"] },
      1: { deck: ["BT1-009"] },
    });
    const controlTurn = control.engine.runOneTurn();
    await advance(control.engine).waitForMainPhase(0);
    control.state.memory = 3;
    expect(control.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await controlTurn;
    expect(control.state.memory).toBe(-3);
  });
});
