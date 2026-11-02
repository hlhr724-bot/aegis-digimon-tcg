import {
  CardColor,
  CardKind,
  assemblyRequirementFor,
  requireCardDefinition,
  type AssemblyRequirement,
  type CardDefinition,
} from "@aegis/shared";
import { describe, expect, it } from "vitest";
import {
  assemblyNeededCount,
  assemblyPossible,
  completedAssemblyRequirement,
  eligibleAssemblyCandidateIds,
} from "./assemblyMaterialSelection";

function card(cardId: string, nameEn: string, options: Partial<CardDefinition> = {}): CardDefinition {
  return {
    cardId,
    set: "TEST",
    nameEn,
    kinds: [CardKind.Digimon],
    colors: [CardColor.Black],
    playCost: 4,
    dp: 4000,
    evoCosts: [],
    maxCountInDeck: 4,
    ...options,
  };
}

const twoPlutomon: AssemblyRequirement = { materials: [{ namesExact: ["Plutomon"], count: 2 }], reduceCost: 4 };

describe("eligibleAssemblyCandidateIds", () => {
  it("offers only trash cards that fit the recipe slot", () => {
    const candidates = [
      { instanceId: "a", definition: card("BT13-084", "Plutomon") },
      { instanceId: "b", definition: card("BT13-084", "Plutomon") },
      { instanceId: "c", definition: card("BT1-001", "Yokomon") },
    ];
    expect([...eligibleAssemblyCandidateIds([twoPlutomon], candidates, [])].sort()).toEqual(["a", "b"]);
  });

  it("stops offering more cards once the exact count is picked", () => {
    const candidates = [
      { instanceId: "a", definition: card("BT13-084", "Plutomon") },
      { instanceId: "b", definition: card("BT13-084", "Plutomon") },
      { instanceId: "c", definition: card("BT13-084", "Plutomon") },
    ];
    expect([...eligibleAssemblyCandidateIds([twoPlutomon], candidates, ["a", "b"])].sort()).toEqual(["a", "b"]);
  });

  it("enforces different levels across the selection", () => {
    const requirement: AssemblyRequirement = {
      materials: [{ traits: ["Dragonkin"], count: 2, differentLevels: true }],
      reduceCost: 3,
    };
    const candidates = [
      { instanceId: "a", definition: card("X-1", "A", { level: 3, types: ["Dragonkin"] }) },
      { instanceId: "b", definition: card("X-2", "B", { level: 3, types: ["Dragonkin"] }) },
      { instanceId: "c", definition: card("X-3", "C", { level: 4, types: ["Dragonkin"] }) },
    ];
    expect([...eligibleAssemblyCandidateIds([requirement], candidates, ["a"])].sort()).toEqual(["a", "c"]);
  });

  it("blocks EX13-077 materials that leave no distinct color for every pick", () => {
    const requirement = assemblyRequirementFor("EX13-077")![0]!;
    const adventure = (cardId: string, colors: CardColor[]) => ({
      instanceId: cardId,
      definition: card(cardId, cardId, { colors, types: ["ADVENTURE"] }),
    });
    const candidates = [
      adventure("red", [CardColor.Red]),
      adventure("otherRed", [CardColor.Red]),
      adventure("redBlack", [CardColor.Red, CardColor.Black]),
      adventure("black", [CardColor.Black]),
      adventure("blue", [CardColor.Blue]),
    ];

    expect([...eligibleAssemblyCandidateIds([requirement], candidates, ["red"])].sort()).toEqual([
      "black",
      "blue",
      "red",
      "redBlack",
    ]);
    // Red/Black can still be read as Black (Rule 4-24-2), but then nothing is left for Black.
    expect([...eligibleAssemblyCandidateIds([requirement], candidates, ["red", "redBlack"])].sort()).toEqual([
      "blue",
      "red",
      "redBlack",
    ]);
  });

  it("matches a name-or-trait disjunction", () => {
    const requirement: AssemblyRequirement = {
      materials: [
        {
          nameOrTrait: [
            { tokens: ["Agumon"], match: "name" },
            { tokens: ["TS"], match: "trait" },
          ],
          count: 1,
        },
      ],
      reduceCost: 2,
    };
    const candidates = [
      { instanceId: "a", definition: card("X-1", "Agumon X") },
      { instanceId: "b", definition: card("X-2", "Shota", { kinds: [CardKind.Tamer], types: ["TS"] }) },
      { instanceId: "c", definition: card("X-3", "Yokomon") },
    ];
    expect([...eligibleAssemblyCandidateIds([requirement], candidates, [])].sort()).toEqual(["a", "b"]);
  });
});

describe("assemblyPossible", () => {
  it("offers the VPS Jesmon deck's SaviorHuckmon as a Huckmon-text Assembly material", () => {
    // 2026-09-19 match 38f38b13: BT20-014 mentions Jesmon in its effects,
    // but qualifies for EX13-014 through the Huckmon text in its own name.
    const requirement = assemblyRequirementFor("EX13-014")![0]!;
    const candidates = ["BT20-014", "BT13-013", "BT20-008", "BT1-010"].map((cardId) => ({
      instanceId: cardId,
      definition: requireCardDefinition(cardId),
    }));
    expect([...eligibleAssemblyCandidateIds([requirement], candidates, [])]).toEqual([
      "BT20-014",
      "BT13-013",
      "BT20-008",
    ]);
    expect(assemblyPossible([requirement], candidates)).toBe(true);
  });

  it("requires the trash to hold the full material count", () => {
    const one = [{ instanceId: "a", definition: card("BT13-084", "Plutomon") }];
    expect(assemblyPossible([twoPlutomon], one)).toBe(false);
    expect(
      assemblyPossible([twoPlutomon], [...one, { instanceId: "b", definition: card("BT13-084", "Plutomon") }]),
    ).toBe(true);
  });
});

describe("Assembly materials with Rule aliases", () => {
  const offered = (recipeCardId: string, materialCardId: string) => {
    const requirement = assemblyRequirementFor(recipeCardId)![0]!;
    const definition = requireCardDefinition(materialCardId);
    return eligibleAssemblyCandidateIds([requirement], [{ instanceId: materialCardId, definition }], []);
  };

  it("offers EX13-056 Giromon's [Rule] [Machine] trait to EX12-060", () => {
    expect(offered("EX12-060", "EX13-056")).toEqual(new Set(["EX13-056"]));
  });

  it("offers EX5-046 Targetmon's [Rule] [Sukamon] name to EX13-031", () => {
    expect(offered("EX13-031", "EX5-046")).toEqual(new Set(["EX5-046"]));
  });
});

describe("Assembly materials gated by a printed keyword", () => {
  const craniamon = () => assemblyRequirementFor("EX13-062")![0]!;
  const trash = (...cardIds: string[]) =>
    cardIds.map((cardId, index) => ({ instanceId: `${cardId}#${index}`, definition: requireCardDefinition(cardId) }));

  it("offers EX13-062 Craniamon's Assembly from black ＜Blocker＞ Lv.5/Lv.4/Lv.3 trash (match d64ba0e9)", () => {
    const candidates = trash("BT20-054", "EX1-047", "BT13-061", "ST15-13");
    expect(assemblyPossible([craniamon()], candidates)).toBe(true);
    expect([...eligibleAssemblyCandidateIds([craniamon()], candidates, [])].sort()).toEqual([
      "BT13-061#2",
      "BT20-054#0",
      "EX1-047#1",
    ]);
  });

  it("offers P-220 Millenniummon's Assembly from [Composite]/[Ver.3] Digimon of different levels", () => {
    const requirement = assemblyRequirementFor("P-220")![0]!;
    const candidates = trash("EX9-023", "BT18-013", "BT18-015", "EX9-034");
    expect(assemblyPossible([requirement], candidates)).toBe(true);
    expect([...eligibleAssemblyCandidateIds([requirement], candidates, ["EX9-023#0"])].sort()).toEqual([
      "BT18-013#1",
      "BT18-015#2",
      "EX9-023#0",
    ]);
  });

  it("offers EX9-062 SkullGreymon as Lv.4 only for EX9-074 Kimeramon's Assembly", () => {
    const skullGreymon = trash("EX9-062");
    const kimeramon = requireCardDefinition("EX9-074");
    const requirement = assemblyRequirementFor("EX9-074")![0]!;
    expect(eligibleAssemblyCandidateIds([requirement], skullGreymon, [], kimeramon)).toEqual(new Set(["EX9-062#0"]));
    expect(eligibleAssemblyCandidateIds([requirement], skullGreymon, [])).toEqual(new Set());
  });

  it("rejects a material whose ＜Blocker＞ is inherited only (Q7412/Q7413)", () => {
    const candidates = trash("BT20-054", "EX1-047", "EX13-050");
    expect([...eligibleAssemblyCandidateIds([craniamon()], candidates, [])]).not.toContain("EX13-050#2");
    expect(assemblyPossible([craniamon()], candidates)).toBe(false);
  });

  it("Discord 1556898336567459890: offers BT23-056 WereGarurumon and completes Craniamon's Assembly", () => {
    const candidates = trash(
      "BT23-056",
      "EX13-051",
      "EX13-047",
      "EX13-050",
      "BT3-067",
      "BT1-072",
      "EX10-029",
      "BT12-066",
      "BT18-052",
      "BT25-074",
    );
    const requirements = [craniamon()];
    const selected = ["BT23-056#0", "EX13-051#1", "EX13-047#2"];
    expect(eligibleAssemblyCandidateIds(requirements, candidates, [])).toEqual(new Set([...selected, "EX10-029#6"]));
    expect(eligibleAssemblyCandidateIds(requirements, candidates, selected.slice(0, 2))).toEqual(new Set(selected));
    expect(completedAssemblyRequirement(requirements, candidates, selected)).toBe(requirements[0]);
  });
});

describe("Assembly recipes restored from the official images", () => {
  const trash = (...cardIds: string[]) =>
    cardIds.map((cardId, index) => ({ instanceId: `${cardId}#${index}`, definition: requireCardDefinition(cardId) }));

  it("offers either of BT24-062 MasterBlimpmon's alternative recipes, never a [TS] Digimon", () => {
    const requirements = assemblyRequirementFor("BT24-062")!;
    const candidates = trash("BT20-049", "BT24-083", "BT24-009");
    expect(assemblyPossible(requirements, candidates)).toBe(true);
    expect([...eligibleAssemblyCandidateIds(requirements, candidates, [])].sort()).toEqual([
      "BT20-049#0",
      "BT24-083#1",
    ]);
    expect(completedAssemblyRequirement(requirements, candidates, ["BT24-083#1"])).toBe(requirements[1]);
    expect(completedAssemblyRequirement(requirements, candidates, ["BT24-009#2"])).toBeUndefined();
    expect(assemblyNeededCount(requirements, candidates, [])).toBe(1);
  });

  it("enforces BT22-078 Boltmon's different card numbers", () => {
    const requirements = assemblyRequirementFor("BT22-078")!;
    const candidates = trash("BT11-084", "BT15-009", "BT15-015", "BT15-069", "BT15-069", "BT18-030");
    const picked = ["BT11-084#0", "BT15-009#1", "BT15-015#2", "BT15-069#3"];
    expect([...eligibleAssemblyCandidateIds(requirements, candidates, picked)].sort()).toEqual(
      [...picked, "BT18-030#5"].sort(),
    );
    expect(completedAssemblyRequirement(requirements, candidates, [...picked, "BT18-030#5"])).toBe(requirements[0]);
  });

  it.each([
    ["AD1-009", ["BT5-015", "AD1-001"]],
    ["AD1-012", ["BT5-029", "AD1-010"]],
    ["AD1-025", ["AD1-004", "AD1-014"]],
    ["EX9-047", ["BT7-069", "EX7-053", "EX9-048", "BT7-069"]],
    ["EX9-073", ["AD1-003", "BT1-021", "BT1-024", "BT10-065"]],
  ])("offers %s's printed Assembly", (cardId, materials) => {
    const requirements = assemblyRequirementFor(cardId)!;
    const candidates = trash(...materials);
    expect(assemblyPossible(requirements, candidates)).toBe(true);
    expect(
      completedAssemblyRequirement(
        requirements,
        candidates,
        candidates.map(({ instanceId }) => instanceId),
      ),
    ).toBe(requirements[0]);
  });

  it("offers a Thundermon beside BT8-061 because BT8-061 can count as [Mamemon]", () => {
    const requirements = assemblyRequirementFor("EX13-063")!;
    const candidates = trash("BT8-061", "P-246", "EX13-053");
    expect(eligibleAssemblyCandidateIds(requirements, candidates, ["BT8-061#0", "P-246#1"])).toContain("EX13-053#2");
    expect(
      completedAssemblyRequirement(
        requirements,
        candidates,
        candidates.map(({ instanceId }) => instanceId),
      ),
    ).toBe(requirements[0]);
  });

  it("does not offer a Thundermon once BT8-061 must count as [Thundermon]", () => {
    const requirements = assemblyRequirementFor("EX13-063")!;
    const candidates = trash("BT8-061", "BT6-064", "EX13-053");
    expect(eligibleAssemblyCandidateIds(requirements, candidates, ["BT8-061#0", "BT6-064#1"])).not.toContain(
      "EX13-053#2",
    );
  });
});
