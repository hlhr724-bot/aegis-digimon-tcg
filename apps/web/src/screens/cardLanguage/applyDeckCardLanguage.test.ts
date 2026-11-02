import { describe, expect, it, vi } from "vitest";
import type { DeckListing } from "@/game/decks";
import { getCardArts } from "@aegis/shared/cards/arts";
import { artRegionOf } from "@aegis/shared/cards/artRegionOf";
import { CardImageLanguage } from "@aegis/shared/cards/CardImageLanguage";
import { convertDeckCardLanguage } from "@/screens/cardLanguage/convertDeckCardLanguage";
import { applyDeckCardLanguage } from "@/screens/cardLanguage/applyDeckCardLanguage";

const deck: DeckListing = {
  id: "personal",
  name: "Personal deck",
  color: "Red",
  blurb: "Keep this",
  mainDeck: ["BT1-010", "BT1-010"],
  eggDeck: ["BT1-001"],
  mainDeckArts: ["BT1-010_P1", "BT1-010"],
  coverCardId: "BT1-010",
  updatedAt: 123,
};

describe("bulk deck card language", () => {
  it.each(Object.values(CardImageLanguage))(
    "standardizes all copies in $value without changing composition",
    ({ value }) => {
      const result = convertDeckCardLanguage({ deck, language: value });
      for (const [cards, arts, previousArts] of [
        [result.deck.mainDeck, result.deck.mainDeckArts, deck.mainDeckArts],
        [result.deck.eggDeck, result.deck.eggDeckArts, deck.eggDeckArts],
      ] as const) {
        cards.forEach((card, index) => {
          const previous = previousArts?.[index] ?? card;
          const expected =
            (artRegionOf(previous)?.value ?? "en") === value
              ? previous
              : getCardArts(card).find((art) => (artRegionOf(art.artId)?.value ?? "en") === value)?.artId;
          expect(expected).toBeDefined();
          expect(arts?.[index] ?? card).toBe(expected);
        });
      }
      expect(result.deck.mainDeck).toEqual(deck.mainDeck);
      expect(result.deck.eggDeck).toEqual(deck.eggDeck);
      expect(result.deck.coverCardId).toBe(deck.coverCardId);
      expect(result.deck.updatedAt).toBe(123);
      expect(result.unavailable).toBe(0);
      expect(convertDeckCardLanguage({ deck: result.deck, language: value }).changed).toBe(false);
    },
  );

  it.each([
    [CardImageLanguage.KOREAN.value, ["BT1-010_P2-K", "BT1-010-K", "BT1-010-K"]],
    [CardImageLanguage.ENGLISH.value, ["BT1-010", "BT1-010_P1", "BT1-010"]],
  ])("keeps parallel prints already in %s and converts the other copies", (language, expected) => {
    const parallels = {
      ...deck,
      mainDeck: ["BT1-010", "BT1-010", "BT1-010"],
      mainDeckArts: ["BT1-010_P2-K", "BT1-010_P1", "BT1-010-J"],
      eggDeck: [],
      eggDeckArts: [],
    };
    const result = convertDeckCardLanguage({ deck: parallels, language });
    expect(result.deck.mainDeckArts).toEqual(expected);
    expect(result.changed).toBe(true);
  });

  it("does not resave a deck whose prints already use the requested language", () => {
    const korean = { ...deck, mainDeckArts: ["BT1-010_P2-K", "BT1-010_P1-K"], eggDeckArts: ["BT1-001-K"] };
    expect(convertDeckCardLanguage({ deck: korean, language: CardImageLanguage.KOREAN.value })).toEqual({
      deck: korean,
      unavailable: 0,
      changed: false,
    });
  });

  it("keeps images without a matching language and counts each copy", () => {
    const missing = {
      ...deck,
      mainDeck: ["missing-card", "missing-card"],
      mainDeckArts: ["custom-a", "custom-b"],
      eggDeck: [],
    };
    const result = convertDeckCardLanguage({ deck: missing, language: CardImageLanguage.JAPANESE.value });
    expect(result.deck).toBe(missing);
    expect(result.unavailable).toBe(2);
    expect(result.changed).toBe(false);
  });

  it("preserves legacy arrays when already using the requested language", () => {
    const legacy = { ...deck, mainDeckArts: undefined, eggDeckArts: undefined };
    expect(convertDeckCardLanguage({ deck: legacy, language: CardImageLanguage.ENGLISH.value }).deck).toBe(legacy);
  });

  it("reports partial failure, continues and retries only unchanged decks", async () => {
    const decks = [deck, { ...deck, id: "second" }];
    const saved = new Map<string, DeckListing>();
    const saveDeck = vi.fn<(value: DeckListing) => Promise<void>>(async (value) => {
      if (value.id === "personal") {
        throw new Error("offline");
      }
      saved.set(value.id, value);
    });
    const onProgress = vi.fn<(completed: number) => void>();
    const language = CardImageLanguage.JAPANESE.value;
    expect(await applyDeckCardLanguage({ decks, language, saveDeck, onProgress })).toEqual({
      saved: 1,
      failed: 1,
      unavailable: 0,
    });
    expect(onProgress.mock.calls).toEqual([[1], [2]]);
    saveDeck.mockImplementation(async (value) => {
      saved.set(value.id, value);
    });
    saveDeck.mockClear();
    expect(
      await applyDeckCardLanguage({
        decks: decks.map((value) => saved.get(value.id) ?? value),
        language,
        saveDeck,
        onProgress,
      }),
    ).toEqual({ saved: 1, failed: 0, unavailable: 0 });
    expect(saveDeck).toHaveBeenCalledOnce();
    expect(saveDeck.mock.calls[0]?.[0].id).toBe("personal");
  });
});
