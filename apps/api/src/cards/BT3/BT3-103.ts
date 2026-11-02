import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] The next time one of your green Digimon digivolves this turn, you may suspend 1 of your Digimon to reduce the memory cost of the digivolution by 5.",
          kind: "Replacement",
          event: "wouldDigivolve",
          mode: "reduceCost",
          amount: 5,
          sourceFilter: {
            zone: "battleArea",
            controller: "mine",
            kind: ["Digimon"],
            colors: ["Green"],
          },
          cost: {
            kind: "suspend",
            target: {
              filter: {
                controller: "mine",
                kind: ["Digimon"],
              },
              count: 1,
            },
            raw: "you may suspend 1 of your Digimon to reduce the memory cost of the digivolution by 5",
          },
          optional: true,
          duration: "forTheTurn",
          raw: "The next time one of your green Digimon digivolves this turn, you may suspend 1 of your Digimon to reduce the memory cost of the digivolution by 5",
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

registerIrCard("BT3-103", compiled);
