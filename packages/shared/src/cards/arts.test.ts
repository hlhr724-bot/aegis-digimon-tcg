import { describe, expect, it } from "vitest";
import { getCardArts, resolveCardArt } from "./arts.js";
import { cardImageUrls } from "./images.js";

describe("alternate printing catalog", () => {
  it("keeps original art first and includes source-declared alternate printings", () => {
    const arts = getCardArts("BT1-010");
    expect(arts[0]?.artId).toBe("BT1-010");
    expect(arts.map((art) => art.artId)).toContain("BT1-010_P1");
    expect(new Set(arts.map((art) => art.artId)).size).toBe(arts.length);
  });
  it("resolves artwork separately from canonical card identity", () => {
    expect(resolveCardArt("BT1-010", "BT1-010_P1").imageId).toBe("BT1-010_P1");
    expect(cardImageUrls("BT1-010", "BT1-010_P1")[0]).toContain("/BT1-010_P1.webp");
  });
  it("falls back for missing, unknown, or another card's art and hides concealed cards", () => {
    for (const artId of [undefined, "BT1-010_P999", "BT1-011_P1"]) {
      expect(resolveCardArt("BT1-010", artId).artId).toBe("BT1-010");
    }
    expect(cardImageUrls(undefined, "BT1-010_P1")).toEqual([]);
    expect(getCardArts("TOKEN-UNKNOWN")).toHaveLength(1);
  });
});

it.each(["__proto__", "constructor", "toString"])(
  "handles hostile unknown card ID %s without reading prototypes",
  (cardId) => {
    expect(getCardArts(cardId)).toEqual([{ artId: cardId, imageId: cardId, label: "Original art" }]);
    expect(resolveCardArt(cardId, "BT1-010_P1").artId).toBe(cardId);
  },
);

it("offers the Japanese printing, where Sistermon Ciel is still Sistermon Noir", () => {
  const artIds = getCardArts("BT6-084").map((art) => art.artId);
  expect(artIds).toEqual(expect.arrayContaining(["BT6-084-J", "BT6-084_P1-J"]));
  expect(resolveCardArt("BT6-084", "BT6-084-J").imageId).toBe("BT6-084-J");
  expect(cardImageUrls("BT6-084", "BT6-084-J")[0]).toContain("/BT6-084-J.webp");
});

it("offers Atratusmon alternate artwork in both languages while keeping original printings", () => {
  expect(getCardArts("BT27-052").map((art) => art.artId)).toEqual([
    "BT27-052",
    "BT27-052-J",
    "BT27-052_P1",
    "BT27-052_P1-J",
  ]);
  expect(cardImageUrls("BT27-052")[0]).toContain("/BT27-052.webp");
  expect(cardImageUrls("BT27-052", "BT27-052_P1")[0]).toContain("/BT27-052_P1.webp");
  expect(cardImageUrls("BT27-052", "BT27-052_P1-J")[0]).toContain("/BT27-052_P1-J.webp");
});

it("offers BanchoLeomon alternate artwork in both languages while keeping original printings", () => {
  expect(getCardArts("BT27-053").map((art) => art.artId)).toEqual([
    "BT27-053",
    "BT27-053-J",
    "BT27-053_P1",
    "BT27-053_P1-J",
  ]);
  expect(cardImageUrls("BT27-053")[0]).toContain("/BT27-053.webp");
  expect(cardImageUrls("BT27-053", "BT27-053_P1")[0]).toContain("/BT27-053_P1.webp");
  expect(cardImageUrls("BT27-053", "BT27-053_P1-J")[0]).toContain("/BT27-053_P1-J.webp");
});

it("offers Japanese printings for Spencer Damon, Nanami, Kouki, & Ivan, and Bio Hybrid Digivolution", () => {
  for (const cardId of ["BT27-090", "BT27-092", "BT27-102"]) {
    expect(getCardArts(cardId).map((art) => art.artId)).toEqual([cardId, `${cardId}-J`]);
    expect(cardImageUrls(cardId, `${cardId}-J`)[0]).toContain(`/${cardId}-J.webp`);
  }
});
