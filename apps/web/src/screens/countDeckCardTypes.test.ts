import { describe, expect, it } from "vitest";
import { countDeckCardTypes } from "@/screens/countDeckCardTypes";

describe("countDeckCardTypes", () => {
  it("counts main deck copies by card type and Digi-Eggs from the egg deck", () => {
    expect(
      countDeckCardTypes({
        main: { "BT1-009": 4, "BT1-084": 1, "BT1-085": 3, "BT1-090": 2 },
        egg: { "BT1-001": 5 },
      }),
    ).toEqual({ Digimon: 5, Tamer: 3, Option: 2, Dual: 0, DigiEgg: 5 });
  });

  it("counts Digimon/Option dual cards apart from Digimon and Options", () => {
    expect(countDeckCardTypes({ main: { "BT1-009": 4, "BT1-090": 2, "BT25-057": 3 } })).toEqual({
      Digimon: 4,
      Tamer: 0,
      Option: 2,
      Dual: 3,
      DigiEgg: 0,
    });
  });

  it("returns zero for every type when the deck is empty", () => {
    expect(countDeckCardTypes({ main: {} })).toEqual({ Digimon: 0, Tamer: 0, Option: 0, Dual: 0, DigiEgg: 0 });
  });

  it("ignores card ids missing from the catalog", () => {
    expect(countDeckCardTypes({ main: { "UNKNOWN-000": 3, "BT1-010": 1 } })).toEqual({
      Digimon: 1,
      Tamer: 0,
      Option: 0,
      Dual: 0,
      DigiEgg: 0,
    });
  });
});
