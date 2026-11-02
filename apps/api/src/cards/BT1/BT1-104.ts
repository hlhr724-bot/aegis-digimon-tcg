import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] All of your Digimon gain the following effect for the turn: “[When Attacking] 1 of your opponent's Digimon gets -2000 DP for the turn.”",
          kind: "SubTrigger",
          event: "whenAttacking",
          playerScoped: true,
          triggerFilter: { controller: "mine", kind: ["Digimon"] },
          actions: [
            {
              kind: "ModifyDP",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              amount: -2000,
              duration: "forTheTurn",
            },
          ],
          duration: "forTheTurn",
          raw: "All of your Digimon gain '[When Attacking] 1 opponent Digimon gets -2000 DP for the turn'",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT1-104", compiled);
export default compiled;
