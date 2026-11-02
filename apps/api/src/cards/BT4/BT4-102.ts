import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Return 1 of your Digimon to its owner's hand to return up to 2 of your opponent's level 4 or lower Digimon to their owners' hands. Trash all of the digivolution cards of those Digimon.",
          kind: "Return",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              allowTokens: true,
            },
            count: 1,
          },
          to: "hand",
          raw: "by returning 1 of your Digimon to its owner's hand",
        },
        {
          effectTextPart:
            "[Main] Return 1 of your Digimon to its owner's hand to return up to 2 of your opponent's level 4 or lower Digimon to their owners' hands. Trash all of the digivolution cards of those Digimon.",
          kind: "Return",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              levelComparison: { op: "lte", value: 4 },
            },
            count: 2,
            upTo: true,
          },
          to: "hand",
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

registerIrCard("BT4-102", compiled);
