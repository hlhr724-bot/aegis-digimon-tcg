import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { settle, setupEngine } from "../../engine/testkit/harness.js";
import "../index.js";

const cardId = "BD02-02";
const blueAlysionDigimon = "BD02-03";
const blueAlysionTamer = "BD02-08";
const redAlysionDigimon = "BD01-03";
const blueWithoutAlysion = "BT1-027";
const redWithoutAlysion = "BT1-009";

function playRenamonOnto(deck: string[]) {
  const s = setupEngine({ 0: { hand: [{ card: cardId, as: "renamon" }], deck } }, { autoSelectCards: true });
  s.state.memory = 5;
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("renamon").instanceId })).toEqual({ ok: true });
  return s;
}

function cardIdsIn(cards: readonly { cardId: string }[]) {
  return cards.map((card) => card.cardId);
}

describe("BD02-02 Renamon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BD02",
      nameEn: "Renamon",
      nameJp: "レナモン",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 2000,
      evoCosts: [{ color: "Blue", level: 2, memoryCost: 0 }],
      forms: ["Rookie"],
      attributes: ["Data"],
      types: ["Beastkin", "ALYSION"],
      rarity: "R",
      effectText:
        "[On Play] Reveal the top 5 cards of your deck. Add 1 blue [ALYSION] trait card among them to the hand. Return the rest to the bottom of the deck.",
    });
    expect(getCardDefinition(cardId)!.inheritedEffectText).toBeUndefined();
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("offers only the blue ALYSION cards among the top 5 and returns the rest to the bottom", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: cardId, as: "renamon" }],
          deck: [
            redAlysionDigimon,
            blueWithoutAlysion,
            blueAlysionDigimon,
            redWithoutAlysion,
            blueAlysionTamer,
            blueAlysionDigimon,
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 5;
    const deck = s.state.players[0]!.deck;
    const eligible = [deck[2]!.instanceId, deck[4]!.instanceId];
    const sixth = deck[5]!.instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("renamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 1);

    const selection = s.decisions.find((decision) => decision.req.kind === "selectCards");
    expect([...(selection?.req.options?.candidateInstanceIds ?? [])].sort()).toEqual([...eligible].sort());
    expect(selection?.req.options?.candidateInstanceIds).not.toContain(sixth);
    expect(cardIdsIn(s.state.players[0]!.hand)).toEqual([blueAlysionDigimon]);
    expect(s.state.players[0]!.deck).toHaveLength(5);
    expect(s.state.players[0]!.deck[0]!.instanceId).toBe(sixth);
    expect(cardIdsIn(s.state.players[0]!.deck.slice(1)).sort()).toEqual(
      [redAlysionDigimon, blueWithoutAlysion, redWithoutAlysion, blueAlysionTamer].sort(),
    );
  });

  it("can add a blue ALYSION Tamer card", async () => {
    const s = playRenamonOnto([redWithoutAlysion, blueAlysionTamer, redWithoutAlysion]);
    await settle(() => s.state.players[0]!.hand.length === 1);

    expect(cardIdsIn(s.state.players[0]!.hand)).toEqual([blueAlysionTamer]);
    expect(s.state.players[0]!.deck).toHaveLength(2);
  });

  it("adds nothing and returns all 5 cards to the bottom without a blue ALYSION card", async () => {
    const s = playRenamonOnto([
      redAlysionDigimon,
      blueWithoutAlysion,
      redWithoutAlysion,
      blueWithoutAlysion,
      redAlysionDigimon,
      blueAlysionDigimon,
    ]);
    await settle(() => s.state.players[0]!.battleArea.length === 1 && s.state.players[0]!.deck.length === 6);
    await settle();

    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.deck[0]!.cardId).toBe(blueAlysionDigimon);
    expect(s.state.players[0]!.deck).toHaveLength(6);
  });

  it("digivolves from a blue level 2 Digimon for 0 memory", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-003", as: "egg" }],
        hand: [{ card: cardId, as: "renamon" }],
        deck: [redWithoutAlysion],
      },
    });
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("egg").permanentId,
        instanceId: s.inst("renamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("egg").topCard.cardId === cardId);

    expect(s.perm("egg").stack.map((card) => card.cardId)).toEqual(["BT1-003"]);
    expect(s.state.memory).toBe(3);
  });
});
