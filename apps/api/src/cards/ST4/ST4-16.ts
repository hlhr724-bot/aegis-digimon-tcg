import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Return 1 of your opponent's suspended Digimon to its owner's hand. Trash all of the digivolution cards of that Digimon.",
          kind: "Return",
          target: {
            filter: {
              controller: "opponent",
              suspended: true,
              kind: ["Digimon"],
            },
            count: 1,
          },
          to: "hand",
        },
        {
          effectTextPart:
            "[Main] Return 1 of your opponent's suspended Digimon to its owner's hand. Trash all of the digivolution cards of that Digimon.",
          kind: "TrashDigivolution",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              suspended: true,
              digivolutionCards: "hasAny",
            },
            count: 1,
            sameTarget: true,
          },
          amount: "all",
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

registerIrCard("ST4-16", compiled);
