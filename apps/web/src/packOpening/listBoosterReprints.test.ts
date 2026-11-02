import { describe, expect, it } from "vitest";
import { getCardArts } from "@aegis/shared/cards/arts";
import { activeCollectionCards } from "@/game/decks";
import { boosterReprints } from "@/packOpening/boosterReprints";
import { drawBoosterPack } from "@/packOpening/drawBoosterPack";
import { listBoosterReprints } from "@/packOpening/listBoosterReprints";
import { listBoosterSets } from "@/packOpening/listBoosterSets";
import { listPackAlternateArts } from "@/packOpening/listPackAlternateArts";
import type { PackCard } from "@/packOpening/PackCard";
import { PackRarity } from "@/packOpening/PackRarity";

function findResurgenceBooster() {
  const boosterSet = listBoosterSets().find((set) => set.setId === "RB1");
  if (!boosterSet) {
    throw new Error("RB1 is missing from the booster lab");
  }
  return boosterSet;
}

describe("RB1 reprints", () => {
  it("lists only reprints that exist in the card catalog", () => {
    const catalog = new Set(activeCollectionCards().map((card) => card.cardId));
    expect(boosterReprints.RB1?.filter((reprint) => !catalog.has(reprint.cardId))).toEqual([]);
  });

  it("adds every pack-rarity reprint to the RB1 pool with its original card ID and RB-01 rarity", () => {
    const pool = findResurgenceBooster().cards;
    const expected = boosterReprints.RB1!.filter((reprint) => reprint.rarity !== "P");
    expect(expected).toHaveLength(70);
    for (const reprint of expected) {
      const card = pool.find((candidate) => candidate.cardId === reprint.cardId);
      expect(card?.rarity).toBe(reprint.rarity);
      expect(card?.set).not.toBe("RB1");
    }
  });

  it("shows each reprint with its RB-01 printing", () => {
    const reprint = listBoosterReprints({ setId: "RB1", cards: activeCollectionCards() }).find(
      (card) => card.cardId === "BT1-114",
    );
    const art = getCardArts("BT1-114").find((candidate) => candidate.artId === reprint?.artId);
    expect(art?.label).toBe("RB-01: Resurgence Booster");
  });

  it("leaves promo-rarity reprints out of the pack pool", () => {
    const pool = findResurgenceBooster().cards;
    expect(pool.some((card) => card.cardId === "P-007")).toBe(false);
  });

  it("does not count a reprint's RB-01 printing again as an alternate-art hit", () => {
    const boosterSet = findResurgenceBooster();
    const alternates = listPackAlternateArts({ cards: boosterSet.cards, setId: "RB1" });
    expect(alternates.every((card) => card.set === "RB1")).toBe(true);
  });

  it("keeps reprints out of the sets they were first printed in", () => {
    const original = listBoosterSets().find((set) => set.setId === "BT1");
    expect(original?.cards.some((card) => card.artId !== undefined)).toBe(false);
    expect(original?.cards.find((card) => card.cardId === "BT1-114")?.rarity).toBe(PackRarity.SECRET_RARE.value);
  });

  it("can pull a reprint into an RB1 pack slot", () => {
    const boosterSet = findResurgenceBooster();
    const pulled: PackCard[] = [];
    let seed = 1;
    function random() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }
    for (let pack = 0; pack < 50; pack += 1) {
      pulled.push(
        ...drawBoosterPack({ setId: "RB1", cards: boosterSet.cards, random }).filter((card) => card.set !== "RB1"),
      );
    }
    expect(pulled.length).toBeGreaterThan(0);
    expect(pulled.every((card) => card.artId !== undefined)).toBe(true);
  });
});
