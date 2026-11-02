import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Return 1 of your opponent's suspended Digimon and 1 of their suspended Tamers to the bottom of their owners’ decks.",
          kind: "Return",
          target: {
            count: 1,
            filter: {
              controller: "opponent",
              suspended: true,
              kind: ["Digimon"],
            },
          },
          to: "deckBottom",
        },
        {
          effectTextPart:
            "[Main] Return 1 of your opponent's suspended Digimon and 1 of their suspended Tamers to the bottom of their owners’ decks.",
          kind: "Return",
          target: {
            count: 1,
            filter: {
              controller: "opponent",
              suspended: true,
              kind: ["Tamer"],
            },
          },
          to: "deckBottom",
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

registerIrCard("BT9-101", compiled);
