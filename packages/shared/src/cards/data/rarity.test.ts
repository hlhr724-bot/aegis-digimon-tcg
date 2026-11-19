import { describe, expect, it } from "vitest";
import { cardData, cardList } from "./index.js";

const HISTORICAL_SECRET_RARES = [
  "BT1-114",
  "BT1-115",
  "BT2-111",
  "BT2-112",
  "BT3-111",
  "BT3-112",
  "BT4-113",
  "BT4-114",
  "BT4-115",
  "BT5-111",
  "BT5-112",
  "BT6-111",
  "BT6-112",
  "BT7-111",
  "BT7-112",
  "BT8-111",
  "BT8-112",
  "BT9-111",
  "BT9-112",
  "BT10-111",
  "BT10-112",
  "EX1-073",
  "EX2-073",
  "EX2-074",
] as const;

describe("rarity data across the legacy enum boundary", () => {
  it("contains exactly the 24 official SEC cards in the BT1-BT10/EX1-EX2 cutoff", () => {
    const inCutoff = cardList.filter((card) => /^(BT(?:[1-9]|10)|EX[12])$/.test(card.set) && card.rarity === "SEC");

    expect(inCutoff.map((card) => card.cardId).sort()).toEqual([...HISTORICAL_SECRET_RARES].sort());
    expect(cardList.filter((card) => /^(BT(?:[1-9]|10)|EX[12])$/.test(card.set) && card.rarity === "UR")).toHaveLength(
      0,
    );
  });

  it("preserves official rarities for P-001 through P-078, including the SR Memory Boost cards", () => {
    // The official Memory Boost! Set lists P-035 through P-040 as SR:
    // https://world.digimoncard.com/cards/index.php?notes=PREMIUM+CARD+COLLECTION+Memory+Boost%21+Set&search=true
    for (let number = 1; number <= 78; number += 1) {
      const cardId = `P-${String(number).padStart(3, "0")}`;
      expect(cardData[cardId]?.rarity, cardId).toBe(number >= 35 && number <= 40 ? "SR" : "P");
    }
  });

  it("lists the secret rares printed before the UR rarity existed as SEC", () => {
    const beforeUltraRare = cardList.filter((card) =>
      /^(BT(?:1[1-9]|2[0-4])|EX(?:[3-9]|1[01])|AD1|RB1|LM)$/.test(card.set),
    );

    expect(beforeUltraRare.filter((card) => card.rarity === "UR").map((card) => card.cardId)).toEqual([]);
    const secretRares = ["BT11-111", "BT24-102", "EX4-073", "EX11-074", "AD1-024", "RB1-036", "LM-020"];
    expect(secretRares.filter((cardId) => cardData[cardId]?.rarity !== "SEC")).toEqual([]);
  });

  it("lists the limited pack promos LM-021 through LM-062 as P", () => {
    const limitedPackPromos = Array.from({ length: 42 }, (_, index) => `LM-${String(index + 21).padStart(3, "0")}`);
    expect(limitedPackPromos.filter((cardId) => cardData[cardId]?.rarity !== "P")).toEqual([]);
  });

  it("preserves modern UR separately from SEC", () => {
    expect(cardData["BT25-043"]?.rarity).toBe("UR");
    expect(cardData["BT25-103"]?.rarity).toBe("SEC");
  });
});
