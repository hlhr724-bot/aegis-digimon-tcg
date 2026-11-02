import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] The next time one of your Digimon digivolves from level 6 to level 7 this turn, reduce the memory cost of the digivolution by 6. At the end of the turn, return the Digimon that digivolved with this effect to the bottom of its owner's deck. Trash all of the digivolution cards of that Digimon.",
          kind: "CostModifier",
          mode: "reduce",
          costType: "digivolve",
          amount: 6,
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              levelComparison: {
                op: "eq",
                value: 6,
              },
            },
            count: "all",
          },
          into: {
            kind: ["Digimon"],
            levelComparison: {
              op: "eq",
              value: 7,
            },
          },
          duration: "forTheTurn",
          once: true,
          consumeBindAs: "digivolvedWithMegaDigimonFusion",
          onConsume: [
            {
              kind: "Return",
              target: {
                filter: {},
                count: 1,
                fromSelectionRef: "digivolvedWithMegaDigimonFusion",
              },
              to: "deckBottom",
            },
          ],
          raw: "The next time one of your Digimon digivolves from level 6 to level 7 this turn, reduce the memory cost of the digivolution by 6. At the end of the turn, return the Digimon that digivolved with this effect to the bottom of its owner's deck. Trash all of the digivolution cards of that Digimon.",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "AddToHandSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT5-109", compiled);
