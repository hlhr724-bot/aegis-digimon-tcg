import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Choose 1 of your Digimon.",
          kind: "SelectBind",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 1,
            bindAs: "chosenDigimon",
          },
        },
        {
          effectTextPart:
            "Until the end of your opponent's turn, 3 of your opponent's Digimon with as many or fewer digivolution cards as that Digimon can't attack or block.",
          kind: "Restrict",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              relativeTo: {
                attr: "digivolutionCount",
                op: "lte",
                selectionRef: "chosenDigimon",
              },
            },
            count: 3,
          },
          restriction: "attackOrBlock",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          effectTextPart: "[Security] 1 of your opponent's Digimon can't attack for the turn.",
          kind: "Restrict",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          restriction: "attack",
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart: "Then, add this card to the hand.",
          kind: "AddToHandSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT14-092", compiled);
export { compiled };
