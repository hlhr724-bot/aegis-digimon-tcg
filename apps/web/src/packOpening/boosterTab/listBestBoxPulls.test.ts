import { describe, expect, it } from "vitest";
import type { OpenedPack } from "@/packOpening/BoosterProgress";
import { listBestBoxPulls } from "@/packOpening/boosterTab/listBestBoxPulls";
import type { PackCard } from "@/packOpening/PackCard";

function createCard(cardId: string, rarity: string, artId?: string): PackCard {
  return { cardId, rarity, artId } as PackCard;
}

function createPack(cards: readonly PackCard[]): OpenedPack {
  return { openedAt: 0, cards: cards.map(({ cardId, artId }) => ({ cardId, artId })) };
}

describe("best box pulls", () => {
  const common = createCard("BT1-001", "C");
  const rare = createCard("BT1-010", "R");
  const superRare = createCard("BT1-020", "SR");
  const alternate = createCard("BT1-030", "R", "BT1-030_P1");
  const eligible = new Map([common, rare, superRare, alternate].map((card) => [card.artId ?? card.cardId, card]));

  it("ranks alternate arts first, skips commons, and keeps one row per card", () => {
    const packs = [createPack([common, rare]), createPack([superRare, rare]), createPack([alternate])];

    expect(listBestBoxPulls({ packs, eligible, limit: 5 })).toEqual([
      { card: alternate, packNumber: 3 },
      { card: superRare, packNumber: 2 },
      { card: rare, packNumber: 1 },
    ]);
  });

  it("stops at the requested limit", () => {
    const packs = [createPack([rare, superRare, alternate])];

    expect(listBestBoxPulls({ packs, eligible, limit: 1 })).toEqual([{ card: alternate, packNumber: 1 }]);
  });
});
