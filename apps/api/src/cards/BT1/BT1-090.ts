import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        { effectTextPart: "[Main] Gain 2 memory.", kind: "GainMemory", amount: 2 },
        { effectTextPart: "At end of turn, lose 2 memory.", kind: "GainMemory", amount: -2, at: "endOfTurn" },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT1-090", compiled);
export default compiled;
