import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "By returning 1 of your blue Digimon to the bottom of the deck, return 1 of their level 6 or lower Digimon to the bottom of the deck instead.",
          kind: "Return",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              levelComparison: {
                op: "lte",
                value: 6,
              },
            },
            count: 1,
          },
          to: "deckBottom",
          bindResultAs: "upgraded",
          cost: {
            kind: "return",
            to: "deckBottom",
            target: {
              filter: {
                controller: "mine",
                kind: ["Digimon"],
                colors: ["Blue"],
              },
              count: 1,
            },
            raw: "By returning 1 of your blue Digimon to the bottom of the deck",
          },
          optional: true,
          abortOnDecline: false,
        },
        {
          effectTextPart: "[Main] Return 1 of your opponent's level 4 or lower Digimon to the bottom of the deck.",
          kind: "Return",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              levelComparison: {
                op: "lte",
                value: 4,
              },
            },
            count: 1,
          },
          to: "deckBottom",
          condition: {
            kind: "bindingEmpty",
            ref: "upgraded",
            raw: "the upgraded return was not used",
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

registerIrCard("BT19-092", compiled);
