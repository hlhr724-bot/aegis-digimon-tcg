import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Return 1 of your opponent's level 5 or lower Digimon to its owner's hand. If your opponent has 3 or more Digimon in play, return 1 of your opponent's Digimon to the bottom of its owner's deck instead. Trash all of the digivolution cards of that Digimon.",
          kind: "ConditionalBranch",
          condition: {
            kind: "opponentHas",
            filter: {
              zone: "battleArea",
              controllerDefault: "opponent",
              kind: ["Digimon"],
            },
            count: 3,
            raw: "if your opponent has 3 or more Digimon in play",
          },
          ifTrue: [
            {
              kind: "SelectBind",
              target: {
                filter: { controller: "opponent", kind: ["Digimon"] },
                count: 1,
                bindAs: "raddleTarget",
              },
            },
            {
              kind: "Return",
              target: { filter: {}, count: 1, fromSelectionRef: "raddleTarget" },
              to: "deckBottom",
            },
          ],
          ifFalse: [
            {
              kind: "SelectBind",
              target: {
                filter: {
                  controller: "opponent",
                  kind: ["Digimon"],
                  levelComparison: { op: "lte", value: 5 },
                },
                count: 1,
                bindAs: "raddleTarget",
              },
            },
            {
              kind: "Return",
              target: { filter: {}, count: 1, fromSelectionRef: "raddleTarget" },
              to: "hand",
            },
          ],
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

registerIrCard("BT6-098", compiled);
