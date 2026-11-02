import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          effectTextPart:
            "[On Play] [When Digivolving] Trash the bottom 3 digivolution cards of 1 of your opponent's Digimon.",
          kind: "TrashDigivolution",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: 3,
          fromTop: false,
        },
        {
          kind: "Restrict",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              digivolutionCards: "none",
            },
            count: 1,
          },
          restriction: "suspend",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          effectTextPart:
            "[On Play] [When Digivolving] Trash the bottom 3 digivolution cards of 1 of your opponent's Digimon.",
          kind: "TrashDigivolution",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: 3,
          fromTop: false,
        },
        {
          kind: "Restrict",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              digivolutionCards: "none",
            },
            count: 1,
          },
          restriction: "suspend",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
          },
          fireCondition: {
            kind: "allOf",
            conditions: [{ kind: "triggerSubjectHasColor", filter: { colors: ["Red"] } }, { kind: "isYourTurn" }],
          },
          actions: [
            {
              kind: "Digivolve",
              target: {
                filter: {
                  isSelfRef: true,
                },
                count: 1,
                isSelf: true,
              },
              into: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Dianamon"],
                    match: "nameExact",
                  },
                ],
              },
              from: ["trash"],
              payCost: true,
              costDelta: -2,
              optional: true,
            },
          ],
          raw: "[Your Turn] When your Digimon are played, if any of them are red, this Digimon may digivolve into [Dianamon] in the trash with the cost reduced by 2",
        },
        {
          kind: "SubTrigger",
          event: "whenOneOfYoursDigivolves",
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
          },
          fireCondition: {
            kind: "allOf",
            conditions: [{ kind: "triggerSubjectHasColor", filter: { colors: ["Red"] } }, { kind: "isYourTurn" }],
          },
          actions: [
            {
              kind: "Digivolve",
              target: {
                filter: {
                  isSelfRef: true,
                },
                count: 1,
                isSelf: true,
              },
              into: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Dianamon"],
                    match: "nameExact",
                  },
                ],
              },
              from: ["trash"],
              payCost: true,
              costDelta: -2,
              optional: true,
            },
          ],
          raw: "[Your Turn] When your Digimon digivolve, if any of them are red, this Digimon may digivolve into [Dianamon] in the trash with the cost reduced by 2",
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "Restrict",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          restriction: "attackTargetChange",
          duration: "permanent",
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 4,
      traits: ["TS"],
      cost: 3,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT25-026", compiled);
