import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const deleteOrTrashSecurity: Action[] = [
  {
    kind: "Delete",
    target: { filter: { controller: "opponent", kind: ["Digimon"], superlative: "lowestLevel" }, count: 1 },
  },
  {
    kind: "SecurityManipulation",
    op: "trashTop",
    controller: "opponent",
    amount: 1,
    condition: { kind: "ifThisEffectDidNotDelete" },
  },
];
const activateOption: Action[] = [
  {
    kind: "CostGatedBlock",
    optional: true,
    cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine", count: 2 },
    actions: [{ kind: "ActivateMain" }],
  },
];

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "Execute" }, { keyword: "Ascension" }] },
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          condition: {
            kind: "youHave",
            filter: {
              controller: "mine",
              zone: ["battleArea", "breeding"],
              nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }],
            },
          },
        },
      ],
    },
    { trigger: "Security", isSecurity: true, actions: deleteOrTrashSecurity },
    { trigger: "OnDeletion", actions: deleteOrTrashSecurity },
    {
      trigger: "WhenDigivolving",
      frequency: "OncePerTurn",
      sharedUseKey: "activate-option",
      actions: activateOption,
    },
    {
      trigger: "WhenAttacking",
      frequency: "OncePerTurn",
      sharedUseKey: "activate-option",
      actions: activateOption,
    },
    {
      trigger: "Main",
      actions: [
        {
          kind: "Delete",
          effectTextPart: "[Main] Delete 1 of your opponent's level 6 or higher Digimon.",
          target: {
            filter: { controller: "opponent", kind: ["Digimon"], levelComparison: { op: "gte", value: 6 } },
            count: 1,
          },
        },
        {
          kind: "PlayWithoutCost",
          effectTextPart:
            "Then, you may play 1 play cost 4 or lower [BEATBREAK] trait card from your trash without paying the cost.",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon", "Tamer"],
              playCostLte: 4,
              nameOrTrait: [{ tokens: ["BEATBREAK"], match: "trait" }],
            },
            count: 1,
          },
          from: ["trash"],
          payCost: false,
          optional: true,
        },
      ],
    },
  ],
  digivolutionRequirement: [{ level: 5, traits: ["Glowing Dawn"], cost: 3, isAlternate: true }],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-082", compiled);
