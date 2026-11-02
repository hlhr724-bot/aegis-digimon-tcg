import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Choose any number of your opponent's Digimon whose total DP adds up to 8000 or less and delete them.",
          kind: "Delete",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: "all", totalDpCap: 8000 },
        },
      ],
    },
    { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST7-12", compiled);
