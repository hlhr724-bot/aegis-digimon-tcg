import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "Replacement",
          event: "wouldBePlayed",
          sourceFilter: {
            isSelfRef: true,
          },
          actions: [
            {
              kind: "Replacement",
              event: "wouldBePlayed",
              mode: "reduceCost",
              amount: 5,
              raw: "reduce the cost by 5",
              condition: {
                kind: "opponentHas",
                filter: {
                  controllerDefault: "opponent",
                  kind: ["Digimon"],
                  levelComparison: {
                    op: "gte",
                    value: 6,
                  },
                },
                raw: "your opponent has a level 6 or higher Digimon",
              },
            },
          ],
        },
      ],
    },
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "Restrict",
          target: {
            filter: {
              controller: "opponent",
              digivolutionCardsAtMost: 1,
              kind: ["Digimon"],
            },
            count: "all",
          },
          restriction: "suspend",
          duration: "untilOpponentTurnEnd",
          whileMatchesTargetFilter: true,
        },
        {
          effectTextPart: "Then, delete 1 of your opponent's unsuspended Digimon.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              unsuspended: true,
              kind: ["Digimon"],
            },
            count: 1,
          },
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Restrict",
          target: {
            filter: {
              controller: "opponent",
              digivolutionCardsAtMost: 1,
              kind: ["Digimon"],
            },
            count: "all",
          },
          restriction: "suspend",
          duration: "untilOpponentTurnEnd",
          whileMatchesTargetFilter: true,
        },
        {
          effectTextPart: "Then, delete 1 of your opponent's unsuspended Digimon.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              unsuspended: true,
              kind: ["Digimon"],
            },
            count: 1,
          },
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: {
            controllerDefault: "any",
            kind: ["Digimon"],
          },
          actions: [
            {
              effectTextPart:
                "[All Turns] [Once Per Turn] When any Digimon are played or digivolve, you may trash any 4 digivolution cards from your opponent's Digimon.",
              kind: "TrashDigivolution",
              target: {
                filter: {
                  controller: "opponent",
                  kind: ["Digimon"],
                  digivolutionCards: "hasAny",
                },
                count: 1,
              },
              amount: 4,
              scope: "acrossDigimon",
              optional: true,
            },
            {
              effectTextPart: "Then, 2 of your Digimon may DNA digivolve into [GraceNovamon] in the hand.",
              kind: "DnaDigivolve",
              materials: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                },
                count: 2,
              },
              into: {
                controllerDefault: "mine",
                zone: "hand",
                nameOrTrait: [
                  {
                    tokens: ["GraceNovamon"],
                    match: "nameExact",
                  },
                ],
              },
              payCost: true,
              optional: true,
            },
          ],
        },
        {
          kind: "SubTrigger",
          event: "whenAnyDigivolves",
          sourceFilter: {
            controllerDefault: "any",
            kind: ["Digimon"],
          },
          actions: [
            {
              effectTextPart:
                "[All Turns] [Once Per Turn] When any Digimon are played or digivolve, you may trash any 4 digivolution cards from your opponent's Digimon.",
              kind: "TrashDigivolution",
              target: {
                filter: {
                  controller: "opponent",
                  kind: ["Digimon"],
                  digivolutionCards: "hasAny",
                },
                count: 1,
              },
              amount: 4,
              scope: "acrossDigimon",
              optional: true,
            },
            {
              effectTextPart: "Then, 2 of your Digimon may DNA digivolve into [GraceNovamon] in the hand.",
              kind: "DnaDigivolve",
              materials: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                },
                count: 2,
              },
              into: {
                controllerDefault: "mine",
                zone: "hand",
                nameOrTrait: [
                  {
                    tokens: ["GraceNovamon"],
                    match: "nameExact",
                  },
                ],
              },
              payCost: true,
              optional: true,
            },
          ],
        },
      ],
      frequency: "OncePerTurn",
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "Restrict",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon", "Tamer"],
            },
            count: 1,
          },
          restriction: "suspend",
          duration: "untilOpponentTurnEnd",
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 5,
      traits: ["TS"],
      cost: 3,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT25-028", compiled);
