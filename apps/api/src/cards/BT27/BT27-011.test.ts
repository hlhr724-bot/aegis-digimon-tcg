import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { matchingAlternateDigivolutionRequirement } from "../../engine/cards/cardData.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { assertNoLoudGap, settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";

const cardId = "BT27-011";
const gemmon = "BT27-006";
const starterGemmon = "ST25-02";
const vanillaRedLevel3 = "BT1-009";
const vanillaRedLevel5 = "BT1-020";
const vanillaRedLevel6 = "ST1-10";

async function digivolveWithAlly(allyDp: number) {
  const preferInstanceIds: string[] = [];
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: gemmon, as: "base" },
          { card: vanillaRedLevel6, as: "ally", dp: allyDp },
        ],
        hand: [{ card: cardId, as: "liskmon" }],
        deck: [vanillaRedLevel3, { card: vanillaRedLevel3, as: "effectDraw" }],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
  );
  preferInstanceIds.push(s.perm("ally").topCard.instanceId);
  s.state.memory = 5;
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("liskmon").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.perm("ally").currentDP === allyDp + 3000 && s.state.pendingDecision === undefined);
  return s;
}

describe("BT27-011 Liskmon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BT27",
      nameEn: "Liskmon",
      nameJp: "リスクモン",
      colors: ["Red"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 4,
      dp: 4000,
      evoCosts: [{ color: "Red", level: 3, memoryCost: 2 }],
      forms: ["Champion"],
      attributes: ["Vaccine"],
      types: ["Bird Dragon", "ALYSION"],
      rarity: "C",
    });
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("digivolves from a level 3 card with [Gemmon] in its text through the alternate requirement only", () => {
    expect(matchingAlternateDigivolutionRequirement(cardId, gemmon)).toMatchObject({ level: 3, cost: 2 });
    expect(matchingAlternateDigivolutionRequirement(cardId, starterGemmon)).toMatchObject({ level: 3, cost: 2 });
    expect(matchingAlternateDigivolutionRequirement(cardId, vanillaRedLevel3)).toBeUndefined();
  });

  it("has printed Raid", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: cardId, as: "liskmon" }] } });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("liskmon"), "Raid")).toBe(true);
  });

  it("boosts a Digimon to 8000 DP when digivolving and draws 1", async () => {
    const s = await digivolveWithAlly(5000);

    expect(s.perm("ally").currentDP).toBe(8000);
    await settle(() => s.state.players[0]!.deck.length === 0);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("effectDraw").instanceId);
    expect(s.state.memory).toBe(3);
    assertNoLoudGap(s);
  });

  it("does not draw when the best Digimon reaches only 7999 DP", async () => {
    const s = await digivolveWithAlly(4999);

    expect(s.perm("ally").currentDP).toBe(7999);
    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([s.inst("effectDraw").instanceId]);
  });

  it("draws when another Digimon already has 8000 DP or more", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: gemmon, as: "base" }, { card: vanillaRedLevel6 }],
          hand: [{ card: cardId, as: "liskmon" }],
          deck: [vanillaRedLevel3, vanillaRedLevel3],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    preferInstanceIds.push(s.perm("base").topCard.instanceId);
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("liskmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.length === 2 && s.state.pendingDecision === undefined);

    expect(s.perm("base").currentDP).toBe(4000 + 2000 + 3000);
  });

  it("boosts and draws when it moves out of the breeding area", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: cardId, as: "liskmon", under: [starterGemmon], dp: 5000 },
          deck: [vanillaRedLevel3],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.phase = Phase.Breeding;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: s.perm("liskmon").permanentId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 1 && s.state.pendingDecision === undefined);

    expect(s.perm("liskmon").currentDP).toBe(5000 + 2000 + 3000);
  });

  it("gives its host Raid as an inherited effect", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: vanillaRedLevel5, as: "host", under: [cardId] }] } });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("host"), "Raid")).toBe(true);
  });
});
