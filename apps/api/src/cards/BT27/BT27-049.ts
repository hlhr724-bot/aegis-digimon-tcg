import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "Digivolve",
          effectTextPart:
            "[When Attacking] This Digimon may digivolve into a Digimon card with [Leomon] in its name or the [ACCEL] trait in the hand. For each of your opponent's Digimon and Tamers, reduce this effect's paid cost by 1.",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          into: {
            controllerDefault: "mine",
            kind: ["Digimon"],
            nameOrTrait: [
              { tokens: ["Leomon"], match: "name" },
              { tokens: ["ACCEL"], match: "trait" },
            ],
          },
          from: ["hand"],
          payCost: true,
          reduceCostScaling: { per: 1, unit: "cards", filter: { controller: "opponent", kind: ["Digimon", "Tamer"] } },
          optional: true,
        },
      ],
    },
    { trigger: "Static", isInherited: true, actions: [], keywords: [{ keyword: "Barrier", raw: "＜Barrier＞" }] },
  ],
  digivolutionRequirement: [
    { namesExact: ["Elecmon"], cost: 2, isAlternate: true },
    { level: 3, traits: ["Holy Beast", "ACCEL"], cost: 2, isAlternate: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-049", compiled);
