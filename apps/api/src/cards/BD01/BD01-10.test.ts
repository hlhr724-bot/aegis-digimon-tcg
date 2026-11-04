import { getCardDefinition } from "@aegis/shared";
import { afterEach, describe, expect, it } from "vitest";
import { registerIrCard, runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { unregisterIrCard } from "../../engine/effects/interpreter/registration/unregisterIrCard.js";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, drainMicrotasks, settle, setupEngine } from "../../engine/testkit/harness.js";
import { syntheticDefinitions } from "../../engine/testkit/syntheticDefinitions.js";
import { compiled as liskmonCompiled } from "./BD01-03.js";
import "../index.js";
import { compiled } from "./BD01-10.js";

const cardId = "BD01-10";
const redAlysion = "BD01-03";
const redWithoutAlysion = "BT1-010";
const blueAlysion = "TEST-BD01-10-BLUE-ALYSION";

const alysionTrait = [{ tokens: ["ALYSION"], match: "trait" }];

function registerBlueAlysion() {
  const liskmon = getCardDefinition(redAlysion)!;
  syntheticDefinitions.set(blueAlysion, {
    ...liskmon,
    cardId: blueAlysion,
    imageId: blueAlysion,
    colors: ["Blue"],
    evoCosts: [{ color: "Blue", level: 3, memoryCost: 2 }],
  });
  registerIrCard(blueAlysion, liskmonCompiled);
}

async function memoryAtMainPhaseWith(digimon: readonly string[]) {
  const s = setupEngine({
    0: {
      battleArea: [{ card: cardId, as: "kanata" }, ...digimon.map((card, index) => ({ card, as: `digimon${index}` }))],
      deck: ["BT1-010", "BT1-010"],
    },
  });
  s.state.memory = 3;
  await s.ready();
  const turn = s.engine.runOneTurn();
  await advance(s.engine).waitForMainPhase(0);
  await drainMicrotasks(20);
  const memory = s.state.memory;
  advance(s.engine).endMainPhaseIfOpen(0);
  await turn;
  return memory;
}

describe("BD01-10 Kanata Hondo", () => {
  afterEach(() => {
    for (const id of syntheticDefinitions.keys()) unregisterIrCard(id);
    syntheticDefinitions.clear();
  });

  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BD01",
      nameEn: "Kanata Hondo",
      nameJp: "本堂カナタ",
      colors: ["Red"],
      kinds: ["Tamer"],
      playCost: 3,
      dp: 0,
      evoCosts: [],
      types: ["ALYSION"],
      rarity: "U",
      effectText:
        "[Start of Your Main Phase] If you have a red Digimon with the [ALYSION] trait, gain 1 memory.\n[Your Turn] All of your red Digimon with the [ALYSION] trait get +1000 DP.",
      securityEffectText: "[Security] Play this card without paying the cost.",
    });
    expect(getCardDefinition(cardId)!.inheritedEffectText).toBeUndefined();
  });

  it("compiles the memory gain, the red ALYSION aura, and the Security play", () => {
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toMatchObject([
      {
        trigger: "StartOfYourMainPhase",
        actions: [
          {
            kind: "GainMemory",
            amount: 1,
            condition: {
              kind: "youHave",
              filter: { controllerDefault: "mine", kind: ["Digimon"], colors: ["Red"], nameOrTrait: alysionTrait },
            },
          },
        ],
      },
      {
        trigger: "YourTurn",
        actions: [
          {
            kind: "ModifyDP",
            target: {
              filter: { controller: "mine", kind: ["Digimon"], colors: ["Red"], nameOrTrait: alysionTrait },
              count: "all",
            },
            amount: 1000,
            duration: "permanent",
          },
        ],
      },
      {
        trigger: "Security",
        isSecurity: true,
        actions: [{ kind: "PlayWithoutCost", target: { filter: { isSelfRef: true }, isSelf: true }, payCost: false }],
      },
    ]);
  });

  it("gains 1 memory at the start of the main phase with a red ALYSION Digimon", async () => {
    expect(await memoryAtMainPhaseWith([redAlysion])).toBe(4);
  });

  it("gains no memory with only a red non-ALYSION Digimon or a non-red ALYSION Digimon", async () => {
    registerBlueAlysion();
    expect(await memoryAtMainPhaseWith([redWithoutAlysion, blueAlysion])).toBe(3);
  });

  it("gives +1000 DP during your turn only to your red ALYSION Digimon", async () => {
    registerBlueAlysion();
    const s = setupEngine({
      0: {
        battleArea: [
          { card: cardId, as: "kanata" },
          { card: redAlysion, as: "redAlysion" },
          { card: redWithoutAlysion, as: "redWithoutAlysion" },
          { card: blueAlysion, as: "blueAlysion" },
        ],
      },
      1: { battleArea: [{ card: redAlysion, as: "opponentAlysion" }] },
    });
    await s.ready();

    expect(s.perm("redAlysion").currentDP).toBe(6000);
    expect(s.perm("redWithoutAlysion").currentDP).toBe(2000);
    expect(s.perm("blueAlysion").currentDP).toBe(5000);
    expect(s.perm("opponentAlysion").currentDP).toBe(5000);
    assertNoLoudGap(s);
  });

  it("gives no DP during the opponent's turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: cardId, as: "kanata" },
          { card: redAlysion, as: "redAlysion" },
        ],
      },
    });
    s.state.turnSeat = 1;
    await s.ready();

    expect(s.perm("redAlysion").currentDP).toBe(5000);
  });

  it("plays itself without paying the cost when revealed as a security card", async () => {
    const s = setupEngine(
      {
        0: { security: [{ card: cardId, as: "kanata" }] },
        1: { battleArea: [{ card: "BT1-010", as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    const memoryBeforeAttack = s.state.memory;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === cardId));

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual([cardId]);
    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.memory).toBe(memoryBeforeAttack);
  });
});
