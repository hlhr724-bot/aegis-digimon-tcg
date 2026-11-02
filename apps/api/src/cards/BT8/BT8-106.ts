import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Reveal the top 3 cards of your deck. You may play any number of Digimon cards with [Mamemon] in their names whose play costs add up to 15 or less among them without paying their memory costs. Delete 1 of your opponent's Digimon with a memory cost of 6 or less for each Digimon played with this effect. Trash the remaining cards.",
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Mamemon"],
                    match: "name",
                  },
                ],
              },
              count: "all",
              costBudget: 15,
              to: "play",
              optional: true,
            },
          ],
          rest: "trash",
          trackPlayedCount: "mamemonPlayed",
        },
        {
          effectTextPart:
            "Delete 1 of your opponent's Digimon with a memory cost of 6 or less for each Digimon played with this effect.",
          kind: "Delete",
          scaling: { unit: "namedCount", countSource: "mamemonPlayed", per: 1 },
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              playCostLte: 6,
            },
            count: 1,
          },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "ActivateMain",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT8-106", compiled);
