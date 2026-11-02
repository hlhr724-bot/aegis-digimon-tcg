import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] 1 of your Digimon gets +3000 DP for the turn.",
          kind: "ModifyDP",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
          amount: 3000,
          duration: "forTheTurn",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        { kind: "Suspend", target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 } },
        { kind: "AddToHandSelf" },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT1-108", compiled);
export default compiled;
