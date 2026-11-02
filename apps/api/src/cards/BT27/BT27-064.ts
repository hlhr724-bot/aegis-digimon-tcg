import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };
const deDigivolveText = "[On Play] [When Digivolving] ＜De-Digivolve 1＞ 1 of your opponent's Digimon.";
const forceAttackText =
  'Then, by trashing the bottom face-down card from under any of your Tamers, give 1 of their Digimon "[Start of Your Main Phase] This Digimon attacks." until their turn ends.';
const handText =
  "[Hand] [Main] If you have a Tamer with [Reina Sakuya] in its name, by placing 1 [Wolvermon] from your trash as any of your [Pristimon]'s bottom digivolution card, that Digimon digivolves into this card, ignoring level.";
const securityText =
  "[All Turns] [Once Per Turn] When attack targets change, if this Digimon has the [Glowing Dawn] trait, by trashing the bottom face-down card from under any of your Tamers, trash your opponent's top security card.";
const deDigivolveThenForceAttack: CardEffect["actions"] = [
  {
    kind: "DeDigivolve",
    effectTextPart: deDigivolveText,
    target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
    amount: 1,
  },
  {
    kind: "CostGatedBlock",
    effectTextPart: forceAttackText,
    optional: true,
    abortOnDecline: true,
    cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine", count: 1 },
    actions: [
      {
        kind: "GainTriggeredEffect",
        effectTextPart: forceAttackText,
        target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
        gainedTrigger: "StartOfYourMainPhase",
        gainedActions: [{ kind: "Attack", target: self }],
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
        filter: { kind: ["Tamer"], nameOrTrait: [{ tokens: ["Reina Sakuya"], match: "name" }] },
      },
      actions: [
        {
          kind: "DigivolveViaPlacement",
          effectTextPart: handText,
          placeCost: {
            kind: "placeFromTrash",
            target: {
              filter: { controller: "mine", nameOrTrait: [{ tokens: ["Wolvermon"], match: "nameExact" }] },
              count: 1,
            },
            destination: "digivolutionStack",
            position: "bottom",
            hostFilter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Pristimon"], match: "nameExact" }],
            },
          },
          into: self,
          cost: 3,
          ignoreLevelRequirement: true,
        },
      ],
    },
    { trigger: "OnPlay", actions: deDigivolveThenForceAttack },
    { trigger: "WhenDigivolving", actions: deDigivolveThenForceAttack },
    {
      trigger: "AllTurns",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenAttackTargetSwitched",
          fireCondition: {
            kind: "selfHasTrait",
            filter: { nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }] },
            raw: "if this Digimon has the [Glowing Dawn] trait",
          },
          actions: [
            {
              kind: "CostGatedBlock",
              effectTextPart: securityText,
              optional: true,
              abortOnDecline: true,
              cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine", count: 1 },
              actions: [{ kind: "SecurityManipulation", op: "trashTop", controller: "opponent", amount: 1 }],
            },
          ],
        },
      ],
    },
  ],
  digivolutionRequirement: [{ level: 4, traits: ["Glowing Dawn"], cost: 3, isAlternate: true }],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-064", compiled);
