import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Filter } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const yourMamemon: Filter = {
  controller: "mine",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["Mamemon"], match: "name" }],
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "GainKeyword",
          effectTextPart:
            "[When Digivolving] If a card with [Mamemon] in its name is in this Digimon's digivolution cards, 1 of your Digimon with [Mamemon] in its name may gain ＜Rush＞ for the turn and attack. At the end of that attack, delete it.",
          condition: {
            kind: "selfDigivolutionStackMatchesFilter",
            filter: { nameOrTrait: [{ tokens: ["Mamemon"], match: "name" }] },
            raw: "a card with [Mamemon] in its name is in this Digimon's digivolution cards",
          },
          target: { filter: yourMamemon, count: 1 },
          keyword: { keyword: "Rush", raw: "＜Rush＞" },
          duration: "forTheTurn",
          optional: true,
          abortOnDecline: true,
        },
        {
          kind: "Attack",
          drainTimingWindowDuringAttack: true,
          target: { filter: yourMamemon, count: 1, sameTarget: true },
          deleteAtEndOfAttack: true,
          condition: { kind: "ifThisEffectActed" },
        },
      ],
    },
    {
      trigger: "OnDeletion",
      actions: [
        {
          kind: "Delete",
          target: { filter: { controller: "opponent", kind: ["Digimon"], superlative: "lowestDP" }, count: 1 },
        },
        {
          kind: "SecurityManipulation",
          op: "trashTop",
          controller: "opponent",
          amount: 1,
          condition: { kind: "ifThisEffectDidNotDelete" },
        },
      ],
    },
    {
      trigger: "AllTurns",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "onDeletionOf",
          sourceFilter: { ...yourMamemon, excludeSelf: true },
          actions: [
            {
              kind: "Delete",
              effectTextPart:
                "[All Turns] [Once Per Turn] When any of your other Digimon with [Mamemon] in their names are deleted, delete 1 of your opponent's Digimon with the lowest play cost.",
              target: {
                filter: { controller: "opponent", kind: ["Digimon"], superlative: "lowestPlayCost" },
                count: 1,
              },
            },
          ],
        },
      ],
    },
  ],
  digivolutionRequirement: [
    { level: 5, names: ["Mamemon"], excludeTraits: ["X Antibody"], cost: 1, isAlternate: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-065", compiled);
