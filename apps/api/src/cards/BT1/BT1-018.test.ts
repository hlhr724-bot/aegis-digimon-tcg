import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT1-018.js";
import "../ST2/ST2-13.js";
import "./BT1-019.js";

describe("BT1-018 Flarerizamon", () => {
  it("matches the catalog and exports the exact Your Turn memory gate", () => {
    expect(getCardDefinition("BT1-018")).toMatchObject({
      cardId: "BT1-018",
      set: "BT1",
      nameEn: "Flarerizamon",
      colors: ["Red"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 5,
      dp: 4000,
      evoCosts: [{ color: "Red", level: 3, memoryCost: 2 }],
      forms: ["Champion"],
      attributes: ["Data"],
      types: ["Fire Dragon"],
      effectText:
        "[Your Turn] While you have 3 or more memory, this Digimon gains ＜Security Attack +1＞. (This Digimon checks 1 additional security card.)",
      rarity: "C",
      maxCountInDeck: 4,
      imageId: "BT1-018",
      nameJp: "フレアリザモン",
    });
    expect(getCardDefinition("BT1-018")?.inheritedEffectText).toBeUndefined();
    expect(getCardDefinition("BT1-018")?.securityEffectText).toBeUndefined();
    expect(compiled).toEqual({
      effects: [
        {
          trigger: "YourTurn",
          actions: [
            {
              kind: "GainKeyword",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              keyword: { keyword: "SecurityAttack", amount: 1 },
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

  it("gains Security Attack +1 while its controller has 3 or more memory", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-018", as: "digimon" }] } });
    s.state.memory = 3;
    await s.engine.recomputeContinuousEffects();
    expect(observe(s.engine).hasKeyword(s.perm("digimon"), "SecurityAttack")).toBe(true);
  });

  it("does not gain Security Attack +1 with only 2 memory", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-018", as: "digimon" }] } });
    s.state.memory = 2;
    await s.engine.recomputeContinuousEffects();
    expect(observe(s.engine).hasKeyword(s.perm("digimon"), "SecurityAttack")).toBe(false);
  });

  it("continuously drops and regains the keyword at the exact memory boundary", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-018", as: "digimon" }] } });
    s.state.memory = 3;
    await s.engine.recomputeContinuousEffects();
    expect(observe(s.engine).hasKeyword(s.perm("digimon"), "SecurityAttack")).toBe(true);

    s.state.memory = 2;
    await s.engine.recomputeContinuousEffects();
    expect(observe(s.engine).hasKeyword(s.perm("digimon"), "SecurityAttack")).toBe(false);

    s.state.memory = 3;
    await s.engine.recomputeContinuousEffects();
    expect(observe(s.engine).hasKeyword(s.perm("digimon"), "SecurityAttack")).toBe(true);
  });

  it("does not gain Security Attack +1 during the opponent's turn", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-018", as: "digimon" }] } });
    s.state.turnSeat = 1;
    s.state.memory = -3;
    await s.engine.recomputeContinuousEffects();
    expect(observe(s.engine).hasKeyword(s.perm("digimon"), "SecurityAttack")).toBe(false);
  });

  it("stops after the first check when Hammer Spark drops its memory below 3", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-018", as: "attacker" }] },
      1: { security: ["ST2-13", "BT1-019"] },
    });
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.memory === 1 && s.state.players[1]!.security.length === 1);

    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(observe(s.engine).hasKeyword(s.perm("attacker"), "SecurityAttack")).toBe(false);
  });

  it("rechecks the memory gate on a newly evolved Flarerizamon", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-009", as: "host" }],
        hand: [{ card: "BT1-018", as: "flarerizamon" }],
        deck: [{ card: "BT1-010", as: "drawn" }],
      },
    });
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("flarerizamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.instanceId === s.inst("flarerizamon").instanceId);

    expect(s.state.memory).toBe(3);
    expect(s.perm("host").stack.map((card) => card.cardId)).toContain("BT1-009");
    expect(observe(s.engine).hasKeyword(s.perm("host"), "SecurityAttack")).toBe(true);
  });
});

describe("BT1-018 Flarerizamon — KB Q&A rulings", () => {
  async function attackWithThreeMemory(security: string[]) {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-018", as: "attacker" }] },
      1: { security },
    });
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    return s;
  }

  it("loses the second check when Hammer Spark drops its memory to 2 or less mid-attack (Q881)", async () => {
    const control = await attackWithThreeMemory(["BT1-009", "BT1-009", "BT1-009"]);
    await settle(() => control.state.players[1]!.security.length === 1);
    expect(control.state.players[1]!.security).toHaveLength(1);
    expect(control.state.memory).toBe(3);

    const s = await attackWithThreeMemory(["ST2-13", "BT1-009", "BT1-009"]);
    await settle(() => s.state.memory === 1 && s.state.players[1]!.security.length < 3);
    await settle();

    expect(s.state.memory).toBe(1);
    expect(s.state.players[1]!.security.map((card) => card.cardId)).toEqual(["BT1-009", "BT1-009"]);
    expect(observe(s.engine).hasKeyword(s.perm("attacker"), "SecurityAttack")).toBe(false);
  });
});
