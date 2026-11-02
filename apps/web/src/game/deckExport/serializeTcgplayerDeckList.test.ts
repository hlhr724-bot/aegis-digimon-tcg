import { describe, expect, it } from "vitest";
import { serializeTcgplayerDeckList } from "@/game/deckExport/serializeTcgplayerDeckList";

function exportCards(mainDeck: string[], eggDeck: string[] = []) {
  return serializeTcgplayerDeckList({ mainDeck, eggDeck });
}

describe("TCGplayer deck list export", () => {
  it("exports English names, quantities, and the marketplace set code", () => {
    expect(exportCards(["BT12-038", "BT12-038"])).toEqual({
      text: "2 GeoGreymon [BT-12]",
      unsupportedCards: [],
    });
  });

  it("includes Digi-Eggs first and sorts each section by card ID", () => {
    expect(exportCards(["BT12-038", "BT12-034"], ["BT12-003", "BT12-003"]).text).toBe(
      "2 Koromon [BT-12]\n1 Agumon [BT-12] BT12-034\n1 GeoGreymon [BT-12]",
    );
  });

  it("uses the correct combined English release for individual cards", () => {
    expect(exportCards(["BT1-010", "BT1-083", "BT19-006", "BT19-003"]).text).toBe(
      "1 Agumon [BT01-03A] BT1-010\n1 GranKuwagamon [BT01-03B]\n1 Viximon [BT19-20]\n1 Pagumon [BT18-19]",
    );
  });

  it("distinguishes different cards with the same name in one marketplace set", () => {
    expect(exportCards(["BT1-010", "BT1-010", "BT2-043"]).text).toBe(
      "2 Agumon [BT01-03A] BT1-010\n1 Agumon [BT01-03A] BT2-043",
    );
  });

  it("handles promo, starter, extra booster and exceptional booster codes", () => {
    expect(exportCards(["P-001", "ST1-03", "EX1-001", "BT27-084"]).text).toBe(
      "1 LordKnightmon (X Antibody) // Ultimate Thrusting Sword Gran Rozerio [BT27]\n1 Agumon [EX-01]\n1 Agumon [D-PR] P-001\n1 Agumon [ST-1]",
    );
  });

  it("preserves punctuation in English card names", () => {
    expect(exportCards(["BT12-031"]).text).toBe("1 Imperialdramon: Fighter Mode [BT-12]");
  });

  it("reports unsupported and unknown cards without silently exporting a complete list", () => {
    const result = exportCards(["LM-063", "UNKNOWN", "UNKNOWN", "BT12-038"]);
    expect(result.text).toBe("1 GeoGreymon [BT-12]");
    expect(result.unsupportedCards).toHaveLength(2);
    expect(result.unsupportedCards[0]).toContain("LM-063");
    expect(result.unsupportedCards[1]).toBe("UNKNOWN");
  });

  it("maps Limited cards to their actual English releases", () => {
    expect(exportCards(["LM-001", "LM-021", "LM-045"]).text).toBe(
      "1 Siriusmon ACE [BT-15]\n1 Agumon - Bond of Bravery ACE [LM-01-05]\n1 Vermillion Memory Boost! [LM-06]",
    );
  });

  it("uses marketplace spellings without changing the shared card names", () => {
    expect(exportCards(["BT1-042", "BT6-105", "BT17-091", "EX5-064"]).text).toBe(
      "1 LoaderLiomon [BT01-03A]\n1 Code Cracker Fang [BT-17]\n1 Gewalt Schwarmer [BT-06]\n1 Koh & Sayo [EX-05]",
    );
  });

  it("exports an empty deck as empty text", () => {
    expect(exportCards([])).toEqual({ text: "", unsupportedCards: [] });
  });
});
