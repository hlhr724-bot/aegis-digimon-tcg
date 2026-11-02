import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter/registration/module";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          kind: "Digivolve",
          target: {
            filter: {},
            count: 1,
            fromSelectionRef: "bt24_016_elizamon",
          },
          into: {
            isSelfRef: true,
          },
          from: ["hand"],
          payCost: true,
          costOverride: 3,
          ignoreRequirements: true,
          condition: {
            kind: "youHave",
            filter: {
              controller: "mine",
              kind: ["Tamer"],
              nameOrTrait: [
                {
                  tokens: ["Owen Dreadnought"],
                  match: "name",
                },
              ],
            },
          },
          cost: {
            kind: "place",
            target: {
              filter: {
                controller: "mine",
                zone: "trash",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Dimetromon"],
                    match: "name",
                  },
                ],
              },
              count: 1,
              from: ["trash"],
            },
            destination: "digivolutionStack",
            position: "bottom",
            host: {
              filter: {
                controller: "mine",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Elizamon"],
                    match: "name",
                  },
                ],
              },
              count: 1,
            },
            bindHostAs: "bt24_016_elizamon",
            raw: "by placing 1 [Dimetromon] from your trash as any of your [Elizamon]'s bottom digivolution card",
          },
          abortOnDecline: true,
        },
      ],
      isFromHand: true,
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          effectTextPart:
            "[When Digivolving] [When Attacking] [Once Per Turn] Your opponent places 1 card from their hand as the bottom security card.",
          kind: "SecurityManipulation",
          op: "addBottom",
          controller: "opponent",
          amount: 1,
          source: "hand",
        },
        {
          effectTextPart: "Then, trash their top security card.",
          kind: "SecurityManipulation",
          op: "trashTop",
          controller: "opponent",
          amount: 1,
        },
      ],
      frequency: "OncePerTurn",
      sharedUseKey: "ir-shared-0",
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          effectTextPart:
            "[When Digivolving] [When Attacking] [Once Per Turn] Your opponent places 1 card from their hand as the bottom security card.",
          kind: "SecurityManipulation",
          op: "addBottom",
          controller: "opponent",
          amount: 1,
          source: "hand",
        },
        {
          effectTextPart: "Then, trash their top security card.",
          kind: "SecurityManipulation",
          op: "trashTop",
          controller: "opponent",
          amount: 1,
        },
      ],
      frequency: "OncePerTurn",
      sharedUseKey: "ir-shared-0",
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSecurityRemoved",
          sourceFilter: { controller: "opponent" },
          fireCondition: {
            kind: "triggerRemovedSecuritySeat",
            seat: "opponent",
          },
          actions: [
            {
              kind: "PlayWithoutCost",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  dp: {
                    op: "lte",
                    value: 5000,
                  },
                  nameOrTrait: [
                    {
                      tokens: ["Reptile", "Dragonkin"],
                      match: "trait",
                    },
                  ],
                },
                count: 1,
              },
              from: ["hand"],
              payCost: false,
              optional: true,
            },
          ],
          raw: "whenSecurityRemoved",
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT24-016", compiled);
