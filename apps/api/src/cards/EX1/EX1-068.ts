import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            '[Main] All of your opponent\'s Digimon gain "[When Attacking] Lose 2 memory" until their turn ends.',
          kind: "GrantAuraToOpponents",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: "all",
          },
          effectText: "[When Attacking] Lose 2 memory",
          duration: "untilOpponentTurnEnd",
          includeLaterEntrants: true,
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "GainMemory",
          amount: 2,
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX1-068", compiled);
