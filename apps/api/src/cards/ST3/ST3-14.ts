import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] 1 of your opponent's Digimon gets -2000 DP for the turn.",
          kind: "ModifyDP",
          target: { filter: { controllerDefault: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: -2000,
          duration: "forTheTurn",
        },
      ],
    },
    { trigger: "Security", actions: [{ kind: "AddToHandSelf" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST3-14", compiled);
export { compiled };
