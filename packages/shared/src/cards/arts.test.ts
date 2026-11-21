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
    "BT27-052_P1",
    "BT27-052_P2",
    "BT27-052-J",
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
    expect(getCardArts(cardId).map((art) => art.artId)).toEqual(expect.arrayContaining([cardId, `${cardId}-J`]));
    expect(cardImageUrls(cardId, `${cardId}-J`)[0]).toContain(`/${cardId}-J.webp`);
  }
});

it("offers Japanese printings for Maildramon, Guardromon, and Lotosmon", () => {
  for (const cardId of ["BT27-062", "BT27-037", "BT27-054"]) {
    expect(getCardArts(cardId).map((art) => art.artId)).toEqual(expect.arrayContaining([cardId, `${cardId}-J`]));
    expect(cardImageUrls(cardId, `${cardId}-J`)[0]).toContain(`/${cardId}-J.webp`);
  }
});

it("offers Japanese printings for the Gaomon line, MirageGaogamon, and Thomas H. Norstein", () => {
  for (const cardId of ["BT27-019", "BT27-024", "BT27-030", "BT27-032", "BT27-089"]) {
    expect(getCardArts(cardId).map((art) => art.artId)).toEqual(expect.arrayContaining([cardId, `${cardId}-J`]));
    expect(cardImageUrls(cardId, `${cardId}-J`)[0]).toContain(`/${cardId}-J.webp`);
  }
});

it("offers Japanese printings for the BT27 Gemmon and Ice-Snow lines, their Tamers, Gurimon, Motimon, Clockmon, and Andromon", () => {
  for (const cardId of [
    "BT27-001",
    "BT27-005",
    "BT27-006",
    "BT27-011",
    "BT27-014",
    "BT27-018",
    "BT27-022",
    "BT27-027",
    "BT27-029",
    "BT27-033",
    "BT27-059",
    "BT27-063",
    "BT27-086",
    "BT27-088",
  ]) {
    expect(getCardArts(cardId).map((art) => art.artId)).toEqual(expect.arrayContaining([cardId, `${cardId}-J`]));
    expect(cardImageUrls(cardId, `${cardId}-J`)[0]).toContain(`/${cardId}-J.webp`);
  }
});

it("offers Jesmon (X Antibody) and Gankoomon (X Antibody) alternate artwork in both languages", () => {
  for (const cardId of ["BT27-016", "BT27-068"]) {
    expect(getCardArts(cardId).map((art) => art.artId)).toEqual(
      expect.arrayContaining([cardId, `${cardId}_P1`, `${cardId}-J`, `${cardId}_P1-J`]),
    );
    expect(cardImageUrls(cardId)[0]).toContain(`/${cardId}.webp`);
    expect(cardImageUrls(cardId, `${cardId}_P1`)[0]).toContain(`/${cardId}_P1.webp`);
    expect(cardImageUrls(cardId, `${cardId}_P1-J`)[0]).toContain(`/${cardId}_P1-J.webp`);
  }
});

it("offers Japanese printings for the ST25 and ST26 reveal cards", () => {
  for (const cardId of [
    "ED01-01",
    "ED01-02",
    "ED01-09",
    "ED01-10",
    "SD01-02",
    "SD01-03",
    "SD01-04",
    "SD02-02",
    "SD02-03",
    "SD02-04",
    "ST25-01",
    "ST25-02",
    "ST25-03",
    "ST25-04",
    "ST25-05",
    "ST25-06",
    "ST26-01",
    "ST26-02",
    "ST26-03",
    "ST26-04",
    "ST26-05",
    "ST26-06",
  ]) {
    expect(getCardArts(cardId).map((art) => art.artId)).toEqual(expect.arrayContaining([cardId, `${cardId}-J`]));
    expect(cardImageUrls(cardId, `${cardId}-J`)[0]).toContain(`/${cardId}-J.webp`);
  }
});

it("offers King Drasil alternate artwork in both languages while keeping original printings", () => {
  expect(getCardArts("BT27-104").map((art) => art.artId)).toEqual([
    "BT27-104",
    "BT27-104_P1",
    "BT27-104_P2",
    "BT27-104-J",
    "BT27-104_P1-J",
  ]);
  expect(cardImageUrls("BT27-104")[0]).toContain("/BT27-104.webp");
  expect(cardImageUrls("BT27-104", "BT27-104_P1")[0]).toContain("/BT27-104_P1.webp");
  expect(cardImageUrls("BT27-104", "BT27-104_P1-J")[0]).toContain("/BT27-104_P1-J.webp");
});
