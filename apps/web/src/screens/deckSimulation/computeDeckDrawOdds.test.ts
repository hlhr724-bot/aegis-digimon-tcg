import { describe, expect, it } from "vitest";
import { computeDeckDrawOdds, DRAW_ODDS_LAST_TURN } from "@/screens/deckSimulation/computeDeckDrawOdds";

const FULL_DECK = { "BT1-009": 4, "BT1-010": 4, "BT1-085": 4, "BT1-090": 2, "BT1-084": 36 };

describe("computeDeckDrawOdds", () => {
  it("shows a turn curve for each key card, the full combo and the Level 3 Digimon", () => {
    const odds = computeDeckDrawOdds({
      main: FULL_DECK,
      keyCardIds: ["BT1-085", "BT1-090"],
      goingFirst: true,
      mulligan: false,
    });
    expect(odds.deckSize).toBe(50);
    expect(odds.rows.map((row) => row.key)).toEqual(["card:BT1-085", "card:BT1-090", "combo", "rookies"]);
    expect(odds.rows.every((row) => row.curve.length === DRAW_ODDS_LAST_TURN + 1)).toBe(true);
    expect(odds.rows.find((row) => row.key === "rookies")?.copies).toBe(8);
    const [tamer, option, combo] = odds.rows;
    expect(combo!.curve[3]!).toBeLessThan(Math.min(tamer!.curve[3]!, option!.curve[3]!));
  });

  it("shows how one more copy raises the chance and hides it at the copy limit", () => {
    const odds = computeDeckDrawOdds({
      main: FULL_DECK,
      keyCardIds: ["BT1-090", "BT1-085"],
      goingFirst: false,
      mulligan: true,
    });
    const option = odds.rows.find((row) => row.cardId === "BT1-090")!;
    const tamer = odds.rows.find((row) => row.cardId === "BT1-085")!;
    expect(option.curveWithOneMore![2]!).toBeGreaterThan(option.curve[2]!);
    expect(tamer.curveWithOneMore).toBeUndefined();
  });

  it("follows card count edits immediately", () => {
    const before = computeDeckDrawOdds({ main: FULL_DECK, keyCardIds: ["BT1-090"], goingFirst: true, mulligan: false });
    const after = computeDeckDrawOdds({
      main: { ...FULL_DECK, "BT1-090": 3, "BT1-084": 35 },
      keyCardIds: ["BT1-090"],
      goingFirst: true,
      mulligan: false,
    });
    expect(after.rows[0]!.curve[0]!).toBeCloseTo(before.rows[0]!.curveWithOneMore![0]!, 12);
  });

  it("skips key cards that left the deck and decks too small to deal security", () => {
    expect(
      computeDeckDrawOdds({ main: FULL_DECK, keyCardIds: ["BT2-001"], goingFirst: true, mulligan: false }).rows.map(
        (row) => row.key,
      ),
    ).toEqual(["rookies"]);
    expect(
      computeDeckDrawOdds({ main: { "BT1-009": 4 }, keyCardIds: ["BT1-009"], goingFirst: true, mulligan: false }).rows,
    ).toEqual([]);
  });
});
