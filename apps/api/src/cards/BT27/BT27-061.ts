import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "Blocker" }] },
    {
      trigger: "OnDeletion",
      actions: [
        {
          kind: "PlayWithoutCost",
          effectTextPart:
            "[On Deletion] You may play 1 play cost 4 or lower Digimon card with [Chessmon] in its name from your hand without paying the cost.",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              playCostLte: 4,
              nameOrTrait: [{ tokens: ["Chessmon"], match: "name" }],
            },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
          optional: true,
        },
      ],
    },
    {
      trigger: "OnDeletion",
      isInherited: true,
      actions: [
        {
          kind: "DeDigivolve",
          effectTextPart: "[On Deletion] ＜De-Digivolve 1＞ 1 of your opponent's Digimon.",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: 1,
        },
      ],
    },
  ],
  digivolutionRequirement: [
    { level: 3, names: ["Chessmon"], cost: 2, isAlternate: true },
    { level: 3, traits: ["DATA SQUAD"], cost: 2, isAlternate: true },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT27-061", compiled);
