import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Delete 1 of your opponent's Digimon with a play cost of 7 or less.",
          kind: "Delete",
          target: {
            filter: { controller: "opponent", kind: ["Digimon"], playCostLte: 7 },
            count: 1,
          },
        },
      ],
    },
    { trigger: "Security", isSecurity: true, actions: [{ kind: "ActivateMain" }] },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST5-16", compiled);
