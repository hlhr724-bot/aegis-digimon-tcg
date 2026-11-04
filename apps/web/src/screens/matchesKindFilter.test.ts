import { describe, expect, it } from "vitest";
import { CardKind } from "@aegis/shared";
import { matchesKindFilter, type KindFilter } from "@/screens/matchesKindFilter";

const cardsByName = {
  digimon: { kinds: [CardKind.Digimon] },
  option: { kinds: [CardKind.Option] },
  dual: { kinds: [CardKind.Digimon, CardKind.Option] },
  digiEgg: { kinds: [CardKind.DigiEgg] },
};

function matchingNames(selectedKinds: KindFilter[]): string[] {
  return Object.entries(cardsByName)
    .filter(([, card]) => matchesKindFilter({ card, selectedKinds }))
    .map(([name]) => name);
}

describe("card type filter", () => {
  it("keeps every card when no type is selected", () => {
    expect(matchingNames([])).toEqual(["digimon", "option", "dual", "digiEgg"]);
  });

  it("shows only DUAL cards under the DUAL chip", () => {
    expect(matchingNames(["Dual"])).toEqual(["dual"]);
  });

  it("lists DUAL cards under both the Digimon and the Option chips", () => {
    expect(matchingNames(["Digimon"])).toEqual(["digimon", "dual"]);
    expect(matchingNames(["Option"])).toEqual(["option", "dual"]);
  });

  it("combines selected types as any-of", () => {
    expect(matchingNames(["Dual", "DigiEgg"])).toEqual(["dual", "digiEgg"]);
  });
});
