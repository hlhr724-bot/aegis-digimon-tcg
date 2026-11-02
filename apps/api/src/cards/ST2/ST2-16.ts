import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Return 1 of your opponent's Digimon to its owner's hand. (Trash all of the digivolution cards of that Digimon.)",
          kind: "Return",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          to: "hand",
        },
      ],
    },
    { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("ST2-16", compiled);
