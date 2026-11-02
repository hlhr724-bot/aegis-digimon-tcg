import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] 1 of your Digimon gets +3000 DP for the turn.",
          kind: "ModifyDP",
          target: { filter: { controllerDefault: "mine", kind: ["Digimon"] }, count: 1 },
          amount: 3000,
          duration: "forTheTurn",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "ModifyDP",
          playerWide: true,
          target: { filter: { controllerDefault: "mine", kind: ["Digimon"] }, count: "all" },
          amount: 5000,
          duration: "forTheTurn",
        },
        { kind: "ModifySecurityDP", controller: "mine", amount: 5000, duration: "forTheTurn" },
        { kind: "AddToHandSelf" },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST3-13", compiled);
export { compiled };
