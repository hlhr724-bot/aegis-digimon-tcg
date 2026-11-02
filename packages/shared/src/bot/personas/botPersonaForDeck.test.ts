import { describe, expect, it } from "vitest";
import { botPersonaForDeck } from "#shared/bot/personas/botPersonaForDeck";
import { botPersonaById } from "#shared/bot/personas/botPersonaById";
import { BOT_PERSONAS } from "#shared/bot/personas/BOT_PERSONAS";
import { ALL_FAMOUS_DECKS, isFamousDeckAvailable } from "#shared/decks/index";
import { getCardDefinition } from "#shared/cards/registry";
import { CardKind } from "#shared/schema/enums";
import { PlayerState } from "#shared/schema/PlayerState";

describe("bot identities", () => {
  it.each([
    ["UlforceVeedramon", "rina-shinomiya", "BT11-112"],
    ["Glowing Dawn", "tomoro-and-kyo", "ST23-13"],
    ["Toho Braves", "kunlun", "BT26-104"],
    ["Chronomon", "kosuke-misono", "BT26-096"],
    ["Jupitermon", "inori-misono", "BT24-084"],
  ])("gives %s its associated character", (archetype, id, portraitCardId) => {
    const deck = ALL_FAMOUS_DECKS.find((entry) => entry.archetype === archetype)!;
    expect(botPersonaForDeck({ deckId: deck.deckId, deck: deck.decklist })).toMatchObject({ id, portraitCardId });
  });

  it("resolves the actual replacement deck instead of an unavailable requested identity", () => {
    const requested = ALL_FAMOUS_DECKS.find((entry) => entry.archetype === "UlforceVeedramon")!;
    const actual = ALL_FAMOUS_DECKS.find((entry) => entry.archetype === "Chronomon")!;
    expect(botPersonaForDeck({ deckId: requested.deckId, deck: actual.decklist }).id).toBe("kosuke-misono");
    expect(
      botPersonaForDeck({
        deck: { mainDeck: [...actual.decklist.mainDeck].reverse(), eggDeck: actual.decklist.eggDeck },
      }).id,
    ).toBe("kosuke-misono");
  });

  it("keeps an unmatched custom list generic even when its title or requested id suggests a character", () => {
    const requested = ALL_FAMOUS_DECKS.find((entry) => entry.archetype === "UlforceVeedramon")!;
    expect(botPersonaForDeck({ deckId: requested.deckId, deck: { mainDeck: ["BT11-112"], eggDeck: [] } })).toEqual({
      id: "aegis",
      displayName: "Aegis",
    });
  });

  it("covers every available recipe with a valid portrait and roundtrips its public identity", () => {
    for (const deck of ALL_FAMOUS_DECKS.filter(isFamousDeckAvailable)) {
      const persona = botPersonaForDeck({ deckId: deck.deckId });
      expect(persona.portraitCardId).toBeDefined();
      expect(getCardDefinition(persona.portraitCardId!)).toBeDefined();
      expect(botPersonaById(persona.id)).toEqual(persona);
    }
  });

  it("uses a Digimon rather than inventing a Tamer relationship for unmatched families", () => {
    const deck = ALL_FAMOUS_DECKS.find((entry) => entry.archetype === "Leviamon")!;
    const persona = botPersonaForDeck({ deckId: deck.deckId });
    expect(persona.id).toMatch(/^digimon:/);
    expect(getCardDefinition(persona.portraitCardId!)?.kinds).toContain(CardKind.Digimon);
  });

  it.each([
    ["Yellow WarGreymon", "tai-kamiya"],
    ["Blue Zudomon", "joe-kido"],
    ["Red Shoutmon DX", "taiki-kudo"],
  ])("gives %s its character through a key Digimon when the recipe has no Tamer", (archetype, id) => {
    const deck = ALL_FAMOUS_DECKS.find((entry) => entry.archetype === archetype)!;
    const tamers = deck.decklist.mainDeck.filter((cardId) => getCardDefinition(cardId)?.kinds.includes(CardKind.Tamer));
    expect(tamers.some((cardId) => getCardDefinition(cardId)?.nameEn.includes(botPersonaById(id)!.displayName))).toBe(
      false,
    );
    expect(botPersonaForDeck({ deckId: deck.deckId }).id).toBe(id);
  });

  it("refuses unknown and non-Digimon generated portrait identities", () => {
    for (const id of [
      null,
      {},
      "constructor",
      "__proto__",
      "digimon:constructor",
      "digimon:../../outside",
      "digimon:BT11-112",
      "missing",
    ]) {
      expect(botPersonaById(id)).toBeUndefined();
    }
    expect(new Set(BOT_PERSONAS.map((persona) => persona.id)).size).toBe(BOT_PERSONAS.length);
  });

  it.each(["ST20-11", "ST13-06", "BT3-019"])("resolves starter and booster Digimon portrait %s", (cardId) => {
    expect(botPersonaById(`digimon:${cardId}`)).toMatchObject({ id: `digimon:${cardId}`, portraitCardId: cardId });
  });

  it("serializes the persona independently of the human account avatar", () => {
    const player = new PlayerState();
    player.seat = 0;
    expect(player.botPersonaId).toBe("");
    player.avatarId = "greymon";
    player.botPersonaId = "rina-shinomiya";
    expect(player.toJSON()).toMatchObject({ avatarId: "greymon", botPersonaId: "rina-shinomiya" });
    expect(Object.keys(player.toJSON()).slice(0, 4)).toEqual(["seat", "displayName", "avatarId", "sessionId"]);
    const keys = Object.keys(player.toJSON());
    expect(keys.slice(keys.indexOf("botPersonaId"))).toEqual([
      "botPersonaId",
      "hideIdentityFromSpectators",
      "spectatorNamesJson",
      "anonymousSpectatorCount",
      "manualInspectionJson",
      "equippedRankedTier",
    ]);
  });
});
