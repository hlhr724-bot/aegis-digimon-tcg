import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            '[Main] 1 of your opponent\'s Digimon gains "[All Turns] When this Digimon becomes suspended, lose 2 memory." until the end of their turn.',
          kind: "GrantAuraToOpponents",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          effectText: "[All Turns] When this Digimon becomes suspended, lose 2 memory.",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "ActivateMain",
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

registerIrCard("BT14-095", compiled);
export { compiled };
