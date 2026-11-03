import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";

const cardId = "BD01-05";
const vanillaLevel6 = "ST1-10";
const vanillaLevel3 = "BT1-009";

async function boardWithReptilimonUnderHost(options: { opponentTargets: number; turnSeat?: 0 | 1 }) {
  const s = setupEngine({
    0: {
      battleArea: [
        { card: vanillaLevel6, as: "host", under: [cardId] },
        { card: vanillaLevel3, as: "ally" },
      ],
    },
    1: {
      battleArea: Array.from({ length: options.opponentTargets }, (_, index) => ({
        card: vanillaLevel3,
        as: `target${index}`,
      })),
    },
  });
  if (options.turnSeat !== undefined) s.state.turnSeat = options.turnSeat;
  await s.ready();
  return s;
}

describe("BD01-05 Reptilimon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BD01",
      nameEn: "Reptilimon",
      nameJp: "レプティリモン",
      colors: ["Red"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 7,
      dp: 6000,
      evoCosts: [{ color: "Red", level: 4, memoryCost: 2 }],
      forms: ["Ultimate"],
      attributes: ["Vaccine"],
      types: ["Dragon Warrior", "ALYSION"],
      rarity: "U",
      inheritedEffectText:
        "[Your Turn][Once Per Turn] When any of your opponent's Digimon are deleted, this Digimon gains ＜Security A. +1＞ for the turn. (This Digimon checks 1 additional security card.)",
    });
    expect(getCardDefinition(cardId)!.effectText).toBeUndefined();
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("digivolves from Liskmon, a red level 4 Digimon, for 2 memory", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BD01-03", as: "base" }],
        hand: [{ card: cardId, as: "reptilimon" }],
        deck: [vanillaLevel3],
      },
    });
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("reptilimon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === cardId);

    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BD01-03"]);
    expect(s.state.memory).toBe(3);
  });

  it("gives its host Security A. +1 when an opposing Digimon is deleted on your turn", async () => {
    const s = await boardWithReptilimonUnderHost({ opponentTargets: 1 });
    expect(observe(s.engine).keywordAmount(s.perm("host"), "SecurityAttack")).toBe(0);

    await advance(s.engine).verb.deletePermanent([s.perm("target0").permanentId]);
    await settle(() => observe(s.engine).keywordAmount(s.perm("host"), "SecurityAttack") === 1);
  });

  it("grants Security A. +1 only once per turn", async () => {
    const s = await boardWithReptilimonUnderHost({ opponentTargets: 2 });

    await advance(s.engine).verb.deletePermanent([s.perm("target0").permanentId]);
    await settle(() => observe(s.engine).keywordAmount(s.perm("host"), "SecurityAttack") === 1);
    await advance(s.engine).verb.deletePermanent([s.perm("target1").permanentId]);
    await drainMicrotasks(20);

    expect(observe(s.engine).keywordAmount(s.perm("host"), "SecurityAttack")).toBe(1);
  });

  it("ignores the deletion of your own Digimon", async () => {
    const s = await boardWithReptilimonUnderHost({ opponentTargets: 0 });

    await advance(s.engine).verb.deletePermanent([s.perm("ally").permanentId]);
    await drainMicrotasks(20);

    expect(observe(s.engine).keywordAmount(s.perm("host"), "SecurityAttack")).toBe(0);
  });

  it("does not trigger during the opponent's turn", async () => {
    const s = await boardWithReptilimonUnderHost({ opponentTargets: 1, turnSeat: 1 });

    await advance(s.engine).verb.deletePermanent([s.perm("target0").permanentId]);
    await drainMicrotasks(20);

    expect(observe(s.engine).keywordAmount(s.perm("host"), "SecurityAttack")).toBe(0);
  });

  it("does not apply while Reptilimon itself is the top card", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: cardId, as: "reptilimon", under: ["BD01-03"] }] },
      1: { battleArea: [{ card: vanillaLevel3, as: "target" }] },
    });
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("target").permanentId]);
    await drainMicrotasks(20);

    expect(observe(s.engine).keywordAmount(s.perm("reptilimon"), "SecurityAttack")).toBe(0);
  });
});
