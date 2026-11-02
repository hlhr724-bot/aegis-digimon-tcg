import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };
const deleteText = "[On Play] [When Digivolving] Delete 1 of your opponent’s level 4 or lower Digimon.";
const gainText =
  "Then, by trashing the bottom face-down card from under any of your Tamers, this Digimon gains ＜Rush＞ and ＜Piercing＞ for the turn.";
const handText =
  "[Hand] [Main] If you have a Tamer with [Makoto Kuonji] in its name, by placing 1 [NightChiropmon] from your trash as any of your [Chiropmon]’s bottom digivolution card, that Digimon digivolves into this card, ignoring level.";
const deleteThenGain: CardEffect["actions"] = [
  {
    kind: "Delete",
    effectTextPart: deleteText,
    target: {
      filter: { controller: "opponent", kind: ["Digimon"], levelComparison: { op: "lte", value: 4 } },
      count: 1,
    },
  },
  {
    kind: "CostGatedBlock",
    effectTextPart: gainText,
    optional: true,
    cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine", count: 1 },
    actions: [
      {
        kind: "GainKeyword",
        effectTextPart: gainText,
        target: self,
        keyword: { keyword: "Rush" },
        duration: "forTheTurn",
      },
      {
        kind: "GainKeyword",
        effectTextPart: gainText,
        target: self,
        keyword: { keyword: "Piercing" },
        duration: "forTheTurn",
      },
    ],
  },
];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      isFromHand: true,
      condition: {
        kind: "youHave",
        filter: { kind: ["Tamer"], nameOrTrait: [{ tokens: ["Makoto Kuonji"], match: "name" }] },
      },
      actions: [
        {
          kind: "DigivolveViaPlacement",
          effectTextPart: handText,
          placeCost: {
            kind: "placeFromTrash",
            target: {
              filter: { controller: "mine", nameOrTrait: [{ tokens: ["NightChiropmon"], match: "nameExact" }] },
              count: 1,
            },
            destination: "digivolutionStack",
            position: "bottom",
            hostFilter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Chiropmon"], match: "nameExact" }],
            },
          },
          into: self,
          cost: 3,
          ignoreLevelRequirement: true,
        },
      ],
    },
    { trigger: "OnPlay", actions: deleteThenGain },
    { trigger: "WhenDigivolving", actions: deleteThenGain },
    {
      trigger: "OnDeletion",
      isInherited: true,
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: { controller: "mine", playCostLte: 5, nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }] },
            count: 1,
          },
          from: ["trash"],
          payCost: false,
          optional: true,
        },
      ],
    },
  ],
  digivolutionRequirement: [{ level: 4, traits: ["Glowing Dawn"], cost: 3, isAlternate: true }],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-080", compiled);
