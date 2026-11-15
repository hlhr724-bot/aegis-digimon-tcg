import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const redGemmonText = {
  colors: ["Red" as const],
  nameOrTrait: [{ tokens: ["Gemmon"], match: "text" as const }],
};

const deleteLowestPerEightThousand: Action = {
  kind: "Modal",
  choose: 1,
  chooseScaling: { per: 8000, unit: "selfDP" },
  labels: ["Delete 1 of your opponent's lowest DP Digimon"],
  options: [
    [
      {
        kind: "Delete",
        target: { filter: { controller: "opponent", kind: ["Digimon"], superlative: "lowestDP" }, count: 1 },
        optional: true,
      },
    ],
  ],
  raw: "For every 8000 DP this Digimon has, you may activate the effect below",
};

const deleteLowestOn = (trigger: CardEffect["trigger"]): CardEffect => ({
  trigger,
  frequency: "OncePerTurn",
  sharedUseKey: "BT27-018/delete-lowest-dp",
  actions: [deleteLowestPerEightThousand],
});

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        { keyword: "Rush", raw: "＜Rush＞" },
        { keyword: "Progress", raw: "＜Progress＞" },
      ],
    },
    deleteLowestOn("WhenDigivolving"),
    deleteLowestOn("WhenAttacking"),
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "onDeletionOf",
          sourceFilter: { controller: "opponent", kind: ["Digimon"] },
          actions: [
            {
              kind: "SecurityManipulation",
              effectTextPart:
                "[All Turns] [Once Per Turn] When any of your opponent's Digimon are deleted, trash their top security card.",
              op: "trashTop",
              controller: "opponent",
              amount: 1,
            },
          ],
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 5, texts: ["Gemmon"], cost: 3, isAlternate: true }],
  assemblyRequirement: [
    {
      materials: [
        { count: 1, level: 5, ...redGemmonText },
        { count: 1, level: 4, ...redGemmonText },
        { count: 1, level: 3, ...redGemmonText },
      ],
      reduceCost: 5,
    },
  ],
};

registerIrCard("BT27-018", compiled);
