import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "Barrier" }] },
    {
      trigger: "WhenAttacking",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "PlayWithoutCost",
          effectTextPart:
            "[When Attacking] [Once Per Turn] You may play 1 Digimon card with [Chessmon] in its name from your hand with the cost reduced by 2.",
          target: {
            filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["Chessmon"], match: "name" }] },
            count: 1,
          },
          from: ["hand"],
          payCost: true,
          reduceCostBy: 2,
          optional: true,
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "ModifyDP",
          effectTextPart: "[When Attacking] [Once Per Turn] 1 of your opponent's Digimon gets -2000 DP for the turn.",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: -2000,
          duration: "forTheTurn",
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
registerIrCard("BT27-039", compiled);
