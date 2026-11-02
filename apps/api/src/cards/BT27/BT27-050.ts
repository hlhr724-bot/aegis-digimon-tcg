import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };
const suspendText = "[On Play] [When Digivolving] You may suspend 1 of your opponent's Digimon or Tamers.";
const lockText =
  "Then, by trashing the bottom face-down card from under any of your Tamers, 1 of their Digimon or Tamers can't unsuspend until their turn ends.";
const handText =
  "[Hand] [Main] If you have a Tamer with [Tomoro Tenma] in its name, by placing 1 [Armalizamon] from your trash as any of your [Gekkomon]'s bottom digivolution card, that Digimon digivolves into this card, ignoring level.";
const suspendThenLock: CardEffect["actions"] = [
  {
    kind: "Suspend",
    effectTextPart: suspendText,
    target: { filter: { controller: "opponent", kind: ["Digimon", "Tamer"] }, count: 1 },
    optional: true,
  },
  {
    kind: "CostGatedBlock",
    effectTextPart: lockText,
    optional: true,
    abortOnDecline: true,
    cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine", count: 1 },
    actions: [
      {
        kind: "Restrict",
        effectTextPart: lockText,
        target: { filter: { controller: "opponent", kind: ["Digimon", "Tamer"] }, count: 1 },
        restriction: "unsuspend",
        duration: "untilOpponentTurnEnd",
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
        filter: { kind: ["Tamer"], nameOrTrait: [{ tokens: ["Tomoro Tenma"], match: "name" }] },
      },
      actions: [
        {
          kind: "DigivolveViaPlacement",
          effectTextPart: handText,
          placeCost: {
            kind: "placeFromTrash",
            target: {
              filter: { controller: "mine", nameOrTrait: [{ tokens: ["Armalizamon"], match: "nameExact" }] },
              count: 1,
            },
            destination: "digivolutionStack",
            position: "bottom",
            hostFilter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Gekkomon"], match: "nameExact" }],
            },
          },
          into: self,
          cost: 3,
          ignoreLevelRequirement: true,
        },
      ],
    },
    { trigger: "OnPlay", actions: suspendThenLock },
    { trigger: "WhenDigivolving", actions: suspendThenLock },
    {
      trigger: "EndOfAttack",
      isInherited: true,
      frequency: "OncePerTurn",
      condition: { kind: "selfHasTrait", filter: { nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }] } },
      actions: [
        {
          kind: "CostGatedBlock",
          optional: true,
          cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine", count: 1 },
          actions: [{ kind: "Unsuspend", target: self }],
        },
      ],
    },
  ],
  digivolutionRequirement: [{ level: 4, traits: ["Glowing Dawn"], cost: 3, isAlternate: true }],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-050", compiled);
