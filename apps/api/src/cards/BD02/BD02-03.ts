import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "TrashDigivolution",
          target: {
            filter: { controller: "opponent", kind: ["Digimon"], digivolutionCards: "hasAny" },
            count: 1,
          },
          amount: 1,
          fromTop: false,
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BD02-03", compiled);
