import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { matchingAlternateDigivolutionRequirement } from "../../engine/cards/cardData.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { assertNoLoudGap, settle, setupEngine } from "../../engine/testkit/harness.js";
import "../index.js";

const cardId = "BT27-006";
const tokomon = "ST25-01";
const starterGemmon = "ST25-02";
const kanataHondo = "ST25-06";
const koromon = "ST1-01";
const redTamer = "ST1-12";
const blackTamer = "BT14-086";
const vanillaRedLevel3 = "BT1-009";
const vanillaRedLevel4 = "BT1-014";

async function playWithDeck(deck: string[], preferredCardIds: string[] = []) {
  const preferInstanceIds: string[] = [];
  const s = setupEngine(
    { 0: { hand: [{ card: cardId, as: "gemmon" }], deck } },
    { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true, preferInstanceIds },
  );
  preferInstanceIds.push(
    ...s.state.players[0]!.deck.filter((card) => preferredCardIds.includes(card.cardId)).map(
      ({ instanceId }) => instanceId,
    ),
  );
  s.state.memory = 5;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gemmon").instanceId })).toEqual({ ok: true });
  await settle(() => s.state.players[0]!.battleArea.length === 1 && s.state.pendingDecision === undefined);
  await settle(() => s.state.players[0]!.hand.length + s.state.players[0]!.deck.length === deck.length);
  return s;
}

describe("BT27-006 Gemmon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BT27",
      nameEn: "Gemmon",
      nameJp: "ジェムモン",
      colors: ["Red"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 2000,
      evoCosts: [{ color: "Red", level: 2, memoryCost: 0 }],
      forms: ["Rookie"],
      attributes: ["Vaccine"],
      types: ["Mythical Beast", "ALYSION"],
      rarity: "R",
    });
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("digivolves from a level 2 card with [Gemmon] in its text through the alternate requirement only", () => {
    expect(matchingAlternateDigivolutionRequirement(cardId, tokomon)).toMatchObject({ level: 2, cost: 0 });
    expect(matchingAlternateDigivolutionRequirement(cardId, koromon)).toBeUndefined();
  });

  it("adds one [ALYSION] card and one red Tamer and returns the rest to the deck bottom", async () => {
    const s = await playWithDeck([starterGemmon, redTamer, vanillaRedLevel4]);

    expect(s.state.players[0]!.hand.map((card) => card.cardId).sort()).toEqual([redTamer, starterGemmon].sort());
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual([vanillaRedLevel4]);
    expect(s.state.memory).toBe(2);
    assertNoLoudGap(s);
  });

  it("adds a red [ALYSION] Tamer in one slot and an [ALYSION] Digimon in the other", async () => {
    const s = await playWithDeck([kanataHondo, starterGemmon, vanillaRedLevel3], [starterGemmon]);

    expect(s.state.players[0]!.hand.map((card) => card.cardId).sort()).toEqual([kanataHondo, starterGemmon].sort());
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual([vanillaRedLevel3]);
  });

  it("adds a lone red [ALYSION] Tamer once", async () => {
    const s = await playWithDeck([kanataHondo, vanillaRedLevel3, vanillaRedLevel4]);

    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual([kanataHondo]);
    expect(s.state.players[0]!.deck.map((card) => card.cardId).sort()).toEqual(
      [vanillaRedLevel3, vanillaRedLevel4].sort(),
    );
  });

  it("adds nothing when only a non-red Tamer and non-[ALYSION] cards are revealed", async () => {
    const s = await playWithDeck([blackTamer, vanillaRedLevel3, vanillaRedLevel4]);

    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(3);
  });

  it("gives its host +2000 DP during your turn only", async () => {
    const yourTurn = setupEngine({ 0: { battleArea: [{ card: vanillaRedLevel3, as: "host", under: [cardId] }] } });
    await yourTurn.ready();
    expect(yourTurn.perm("host").currentDP).toBe(3000 + 2000);

    const opponentTurn = setupEngine({ 0: { battleArea: [{ card: vanillaRedLevel3, as: "host", under: [cardId] }] } });
    opponentTurn.state.turnSeat = 1;
    await opponentTurn.ready();
    expect(opponentTurn.perm("host").currentDP).toBe(3000);
  });
});
