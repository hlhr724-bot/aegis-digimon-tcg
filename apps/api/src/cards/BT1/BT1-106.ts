import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] 1 of your opponent's Digimon gets -7000 DP for the turn.",
          kind: "ModifyDP",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: -7000,
          duration: "forTheTurn",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT1-106", compiled);
export default compiled;
