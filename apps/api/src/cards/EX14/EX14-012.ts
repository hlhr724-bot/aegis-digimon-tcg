import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const boostAndDelete: Action[] = [
  {
    kind: "ModifyDP",
    effectTextPart: "1 of your Digimon gets +3000 DP until the end of your opponent's turn.",
    target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
    amount: 3000,
    duration: "untilOpponentTurnEnd",
  },
  {
    kind: "Delete",
    effectTextPart:
      "Then, by trashing the bottom face-down card from under any of your Tamers, delete 1 of your opponent's Digimon with as much DP as this Digimon or less.",
    target: {
      filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", relativeToSource: true } },
      count: 1,
    },
    cost: {
      kind: "trashBottomFaceDownUnderTamer",
      controller: "mine",
      count: 1,
      raw: "by trashing the bottom face-down card from under any of your Tamers",
    },
    optional: true,
  },
];
const useSelf: Action = {
  kind: "UseOptionWithoutCost",
  effectTextPart: "You may use this card without paying the cost.",
  filter: { isSelfRef: true },
  target: { filter: { isSelfRef: true }, count: 1 },
  from: ["trash", "security"],
  payCost: false,
  optional: true,
};

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "SecurityAttack", amount: 1 }, { keyword: "Engage" }] },
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          condition: {
            kind: "youHave",
            filter: { controller: "mine", nameOrTrait: [{ tokens: ["TERMINAL"], match: "trait" }] },
          },
        },
      ],
    },
    { trigger: "WhenDigivolving", frequency: "OncePerTurn", sharedUseKey: "boost-delete", actions: boostAndDelete },
    { trigger: "WhenAttacking", frequency: "OncePerTurn", sharedUseKey: "boost-delete", actions: boostAndDelete },
    { trigger: "OnDeletion", actions: [useSelf] },
    { trigger: "Security", isSecurity: true, actions: [useSelf] },
    {
      trigger: "Main",
      actions: [
        {
          kind: "Delete",
          effectTextPart: "Delete up to 15000 DP total worth of your opponent's Digimon.",
          target: {
            filter: { controller: "opponent", kind: ["Digimon"] },
            count: "all",
            upTo: true,
            totalDpCap: 15000,
          },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 5, traits: ["TERMINAL"], cost: 3, isAlternate: true }],
};

registerIrCard("EX14-012", compiled);
