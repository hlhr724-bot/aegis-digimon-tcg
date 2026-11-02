import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../ST2/ST2-13.js";
import liamon from "./BT1-054.js";

describe("BT1-054 Liamon", () => {
  it("matches the catalog and exact conditional When Attacking IR contract", () => {
    expect(getCardDefinition("BT1-054")).toMatchObject({
      cardId: "BT1-054",
      set: "BT1",
      nameEn: "Liamon",
      colors: ["Yellow"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 4,
      dp: 4000,
      evoCosts: [{ color: "Yellow", level: 3, memoryCost: 3 }],
      forms: ["Champion"],
      attributes: ["Vaccine"],
      types: ["Holy Beast"],
      effectText:
        "[When Attacking] If you have 3 or more memory, 1 of your opponent's Digimon gets -2000 DP for the turn.",
      rarity: "C",
      maxCountInDeck: 4,
      imageId: "BT1-054",
      nameJp: "ライアモン",
    });
    expect(getCardDefinition("BT1-054")?.inheritedEffectText).toBeUndefined();
    expect(getCardDefinition("BT1-054")?.securityEffectText).toBeUndefined();
    expect(liamon).toEqual({
      effects: [
        {
          trigger: "WhenAttacking",
          actions: [
            {
              kind: "ModifyDP",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              amount: -2000,
              duration: "forTheTurn",
              condition: { kind: "memoryAtLeast", value: 3, controller: "mine" },
            },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("gives an opposing Digimon -2000 DP when attacking with at least 3 memory", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-054", as: "attacker" }] },
        1: { battleArea: [{ card: "BT1-016", as: "target", dp: 5000 }], security: ["BT1-010"] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === 3000);
    expect(s.perm("target").currentDP).toBe(3000);
  });

  it("reduces exactly one opposing Digimon when several are eligible", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-054", as: "attacker" }] },
        1: {
          battleArea: [
            { card: "BT1-016", as: "first", dp: 5000 },
            { card: "BT1-016", as: "second", dp: 5000 },
          ],
          security: ["BT1-010"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("first").currentDP === 3000 || s.perm("second").currentDP === 3000);

    expect([s.perm("first").currentDP, s.perm("second").currentDP].sort()).toEqual([3000, 5000]);
  });

  it("keeps the activated DP reduction after security lowers memory below 3", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-054", as: "attacker" }] },
        1: { battleArea: [{ card: "BT1-016", as: "target", dp: 5000 }], security: ["ST2-13"] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0 && s.state.memory === 1);
    expect(s.state.memory).toBe(1);
    expect(s.perm("target").currentDP).toBe(3000);
  });

  it("does not reduce DP when the attack starts with only 2 memory", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-054", as: "attacker" }] },
        1: { battleArea: [{ card: "BT1-016", as: "target", dp: 5000 }], security: ["BT1-010"] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 2;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);

    expect(s.perm("target").currentDP).toBe(5000);
  });

  it("restores the target's DP at the end of the turn", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-054", as: "attacker" }] },
        1: { battleArea: [{ card: "BT1-016", as: "target", dp: 5000 }], security: ["BT1-010"] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === 3000);

    await advance(s.engine).runTurn(0);

    expect(s.perm("target").currentDP).toBe(5000);
  });

  it("resolves its attack trigger from a newly evolved Liamon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-050", as: "base" }],
          hand: [{ card: "BT1-054", as: "liamon" }],
          deck: [{ card: "BT1-010", as: "evolutionDraw" }],
        },
        1: { battleArea: [{ card: "BT1-016", as: "target", dp: 5000 }], security: ["BT1-010"] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 6;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("liamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("liamon").instanceId);

    expect(s.state.memory).toBe(3);
    expect(s.perm("base").stack.map((card) => card.cardId)).toContain("BT1-050");
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === 3000);

    expect(s.perm("target").currentDP).toBe(3000);
  });
});

describe("BT1-054 Liamon — KB Q&A rulings", () => {
  it("keeps the -2000 DP for the turn after memory later drops to 2 or less (Q914)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-054", as: "attacker" }] },
        1: { battleArea: [{ card: "BT1-016", as: "target", dp: 5000 }], security: ["ST2-13"] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === 3000);
    await settle(() => s.state.players[1]!.security.length === 0 && s.state.memory === 1);
    await advance(s.engine).finishAttack();
    await s.engine.recomputeContinuousEffects();

    expect(s.state.turnSeat).toBe(0);
    expect(s.state.memory).toBe(1);
    expect(s.perm("target").currentDP).toBe(3000);
  });
});
