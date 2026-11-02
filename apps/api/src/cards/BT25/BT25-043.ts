import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          condition: {
            kind: "youHave",
            filter: {
              controllerDefault: "mine",
              zone: ["battleArea", "breeding"],
              nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }],
            },
            raw: "you have a card w/[Glowing Dawn] trait",
          },
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          effectTextPart: "[When Digivolving] [When Attacking] [Once Per Turn] ＜Recovery +1＞",
          kind: "SecurityManipulation",
          op: "addTop",
          controller: "mine",
          source: "deck",
          amount: 1,
        },
        {
          effectTextPart:
            "Then, by trashing the top security card of 1 player with the most security cards, this Digimon unsuspends.",
          kind: "RecoverByTrashingMostSecurity",
          amount: 1,
          recover: false,
        },
        {
          kind: "Unsuspend",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          condition: { kind: "ifThisEffectActed" },
        },
      ],
      frequency: "OncePerTurn",
      sharedUseKey: "ir-shared-0",
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          effectTextPart: "[When Digivolving] [When Attacking] [Once Per Turn] ＜Recovery +1＞",
          kind: "SecurityManipulation",
          op: "addTop",
          controller: "mine",
          source: "deck",
          amount: 1,
        },
        {
          effectTextPart:
            "Then, by trashing the top security card of 1 player with the most security cards, this Digimon unsuspends.",
          kind: "RecoverByTrashingMostSecurity",
          amount: 1,
          recover: false,
        },
        {
          kind: "Unsuspend",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          condition: { kind: "ifThisEffectActed" },
        },
      ],
      frequency: "OncePerTurn",
      sharedUseKey: "ir-shared-0",
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          mode: "prevent",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }],
            },
            count: "all",
          },
          affectsAll: true,
          cost: {
            kind: "trash",
            target: {
              filter: {
                controller: "mine",
                zone: "security",
              },
              count: 1,
            },
            raw: "by trashing your top security card",
          },
        },
      ],
      frequency: "OncePerTurn",
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] 1 of your opponent's Digimon gets -8000 DP for the turn.",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: -8000,
          duration: "forTheTurn",
        },
        {
          effectTextPart:
            "Then, by trashing your top security card, all of your opponent's Digimon get -5000 DP for the turn.",
          kind: "ModifyDP",
          playerWide: true,
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: "all",
          },
          amount: -5000,
          duration: "forTheTurn",
          cost: {
            kind: "trash",
            target: {
              filter: {
                controller: "mine",
                zone: "security",
              },
              count: 1,
            },
            raw: "by trashing your top security card",
          },
          optional: true,
          abortOnDecline: true,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 5,
      traits: ["Glowing Dawn"],
      cost: 3,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT25-043", compiled);
