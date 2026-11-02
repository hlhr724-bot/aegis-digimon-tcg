import type { Action, CompiledCard, Condition, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const evilDragonTraits: Filter["nameOrTrait"] = [{ tokens: ["Evil", "Dark Dragon", "Evil Dragon"], match: "trait" }];

const handAtMostFour: Condition = {
  kind: "zoneCount",
  seat: "mine",
  zone: "hand",
  op: "lte",
  value: 4,
  raw: "your hand has 4 or fewer cards",
};

const trashPlay: Extract<Action, { kind: "PlayWithoutCost" }> = {
  kind: "PlayWithoutCost",
  target: {
    filter: {
      controller: "mine",
      kind: ["Digimon"],
      zone: "trash",
      levelComparison: { op: "lte", value: 4 },
      nameOrTrait: evilDragonTraits,
    },
    count: 1,
  },
  from: ["trash"],
  payCost: false,
};

// "To the field" permits either area. Breeding remains single-occupancy and
// an effect played there does not activate its On Play effects (CR 3-4-7).
const playFromTrash: Action[] = [
  {
    kind: "Modal",
    choose: 1,
    optional: true,
    labels: ["Battle area", "Breeding area"],
    optionConditions: [null, { kind: "youHaveNone", filter: { controller: "mine", zone: "breeding" } }],
    options: [[trashPlay], [{ ...trashPlay, breeding: true }]],
  },
];

const trashTwoThenActivateOptionSide: Action[] = [
  {
    kind: "Trash",
    effectTextPart: "[When Digivolving] [On Deletion] Trash 2 cards in your hand.",
    target: { filter: { controller: "mine", zone: "hand" }, count: 2 },
  },
  {
    kind: "ActivateMain",
    effectTextPart: "Then, you may activate 1 [Main] effect on this card's Option side.",
    optional: true,
  },
];

export const compiled: CompiledCard = {
  cardId: "LM-068",
  keywords: [{ keyword: "SecurityAttack", amount: 1, raw: "＜Security A. +1＞" }],
  effects: [
    {
      trigger: "WhenDigivolving",
      condition: handAtMostFour,
      actions: playFromTrash,
      description:
        "[When Digivolving] [End of Attack] If your hand has 4 or fewer cards, you may play 1 level 4 or lower Digimon card with the [Evil], [Dark Dragon] or [Evil Dragon] trait from your trash to the field without paying the cost.",
    },
    {
      trigger: "EndOfAttack",
      condition: handAtMostFour,
      actions: playFromTrash,
      description:
        "[When Digivolving] [End of Attack] If your hand has 4 or fewer cards, you may play 1 level 4 or lower Digimon card with the [Evil], [Dark Dragon] or [Evil Dragon] trait from your trash to the field without paying the cost.",
    },
    {
      trigger: "WhenDigivolving",
      actions: trashTwoThenActivateOptionSide,
      description:
        "[When Digivolving] [On Deletion] Trash 2 cards in your hand. Then, you may activate 1 [Main] effect on this card's Option side.",
    },
    {
      trigger: "OnDeletion",
      actions: trashTwoThenActivateOptionSide,
      description:
        "[When Digivolving] [On Deletion] Trash 2 cards in your hand. Then, you may activate 1 [Main] effect on this card's Option side.",
    },
    {
      trigger: "Trash",
      isFromTrash: true,
      actions: [
        {
          kind: "SubTrigger",
          event: "whenAttacking",
          sourceFilter: { controller: "mine", kind: ["Digimon"], nameOrTrait: evilDragonTraits },
          fireCondition: { kind: "isYourTurn" },
          activationCondition: handAtMostFour,
          actions: [
            {
              kind: "UseOptionWithoutCost",
              filter: { isSelfRef: true },
              target: { filter: { isSelfRef: true }, count: 1 },
              from: ["trash"],
              payCost: true,
              reduceCostBy: 3,
              optional: true,
            },
          ],
        },
      ],
      description:
        "[Trash] [Your Turn] When one of your [Evil], [Dark Dragon] or [Evil Dragon] trait Digimon attacks, if your hand has 4 or fewer cards, you may use this card with the cost reduced by 3.",
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Delete 1 of your opponent's Digimon with a level as high as the number of cards in your hand or higher.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              levelComparison: {
                op: "gte",
                value: 0,
                scaling: { per: 1, unit: "cards", filter: { controller: "mine", zone: "hand" } },
              },
            },
            count: 1,
          },
        },
      ],
      description:
        "[Main] Delete 1 of your opponent's Digimon with a level as high as the number of cards in your hand or higher.",
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 5, traits: ["Dark Dragon", "Evil Dragon"], cost: 4, isAlternate: true }],
};

registerIrCard("LM-068", compiled);
export default compiled;
