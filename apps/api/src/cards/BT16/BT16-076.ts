import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          effectTextPart:
            "[When Digivolving] By trashing 2 cards in your hand, delete 1 of your opponent's 6000 DP or lower Digimon.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              dp: {
                op: "lte",
                value: 6000,
              },
            },
            count: 1,
          },
          cost: {
            kind: "trash",
            target: {
              filter: {
                zone: "hand",
                controller: "mine",
              },
              count: 2,
            },
            raw: "By trashing 2 cards in your hand",
          },
          optional: true,
          abortOnDecline: true,
          allowCostWithoutTarget: true,
        },
        {
          effectTextPart:
            "If this effect didn't delete, you may play 1 level 4 or lower [SoC] trait Digimon card from your trash without paying the cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              levelComparison: {
                op: "lte",
                value: 4,
              },
              nameOrTrait: [
                {
                  tokens: ["SoC"],
                  match: "trait",
                },
              ],
            },
            count: 1,
          },
          from: ["trash"],
          payCost: false,
          condition: {
            kind: "ifThisEffectDidNotDelete",
            raw: "this effect didn't delete",
          },
          optional: true,
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "onDeletionOf",
          sourceFilter: {
            controller: "mine",
            excludeSelf: true,
            kind: ["Digimon"],
            nameOrTrait: [
              {
                tokens: ["SoC"],
                match: "trait",
              },
            ],
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
                    tokens: ["Fenriloogamon"],
                    match: "name",
                  },
                ],
              },
              payCost: false,
              from: ["trash"],
              optional: true,
              condition: {
                kind: "selfDigivolutionStackMatchesFilter",
                filter: {
                  kind: ["Tamer"],
                  nameOrTrait: [{ tokens: ["SoC"], match: "trait" }],
                },
                raw: "a Tamer card with the [SoC] trait is in this Digimon's digivolution cards",
              },
            },
          ],
        },
      ],
    },
    {
      trigger: "EndOfAttack",
      actions: [
        {
          kind: "Unsuspend",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          condition: {
            kind: "memoryAtLeast",
            controller: "opponent",
            value: 1,
            raw: "your opponent has 1 or more memory",
          },
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
      level: 4,
      traits: ["SoC"],
      cost: 3,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT16-076", compiled);
export { compiled };
