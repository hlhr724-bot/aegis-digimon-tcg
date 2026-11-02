import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Change the original DP of 1 of your opponent's Digimon to 3000 until the end of your opponent's next turn.",
          kind: "SetBaseDP",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          value: 3000,
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT1-105", compiled);
export default compiled;
