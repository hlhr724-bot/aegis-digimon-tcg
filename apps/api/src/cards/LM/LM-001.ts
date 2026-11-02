import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Hand",
      actions: [],
      keywords: [
        {
          keyword: "BlastDigivolve",
          raw: "[Hand] [Counter] (Your Digimon may digivolve into this card without paying the cost)",
        },
      ],
    },
    {
      trigger: "Counter",
      actions: [],
      keywords: [
        {
          keyword: "BlastDigivolve",
          raw: "[Hand] [Counter] (Your Digimon may digivolve into this card without paying the cost)",
        },
      ],
    },
    {
      trigger: "OnPlay",
      actions: [
        {
          effectTextPart:
            "[On Play] [When Digivolving] You may place 1 card with [Gammamon] in its text from your hand as this Digimon's bottom digivolution card.",
          kind: "PlaceUnder",
          target: {
            filter: {
              controller: "mine",
              nameOrTrait: [
                {
                  tokens: ["Gammamon"],
                  match: "text",
                },
              ],
            },
            from: ["hand"],
            count: 1,
          },
          underFilter: {
            isSelfRef: true,
          },
          position: "bottom",
          optional: true,
        },
        {
          kind: "CostModifier",
          mode: "raiseCeiling",
          costType: "dpDeletion",
          amount: 1000,
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          scaling: {
            per: 1,
            unit: "digivolutionCardColors",
          },
        },
        {
          effectTextPart:
            "Then, delete 1 of your opponent's Digimon with 8000 DP or less. For each color in this Digimon's digivolution cards, add 1000 to this DP deletion effect's maximum.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              dp: {
                op: "lte",
                value: 8000,
              },
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
          effectTextPart:
            "[On Play] [When Digivolving] You may place 1 card with [Gammamon] in its text from your hand as this Digimon's bottom digivolution card.",
          kind: "PlaceUnder",
          target: {
            filter: {
              controller: "mine",
              nameOrTrait: [
                {
                  tokens: ["Gammamon"],
                  match: "text",
                },
              ],
            },
            from: ["hand"],
            count: 1,
          },
          underFilter: {
            isSelfRef: true,
          },
          position: "bottom",
          optional: true,
        },
        {
          kind: "CostModifier",
          mode: "raiseCeiling",
          costType: "dpDeletion",
          amount: 1000,
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          scaling: {
            per: 1,
            unit: "digivolutionCardColors",
          },
        },
        {
          effectTextPart:
            "Then, delete 1 of your opponent's Digimon with 8000 DP or less. For each color in this Digimon's digivolution cards, add 1000 to this DP deletion effect's maximum.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              dp: {
                op: "lte",
                value: 8000,
              },
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
          event: "onDeletionOf",
          sourceFilter: {
            controllerDefault: "any",
            excludeSelf: true,
            kind: ["Digimon"],
          },
          actions: [
            {
              kind: "GainMemory",
              amount: 1,
            },
          ],
        },
      ],
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 5, texts: ["Gammamon"], cost: 4, isAlternate: true }],
};

registerIrCard("LM-001", compiled);
