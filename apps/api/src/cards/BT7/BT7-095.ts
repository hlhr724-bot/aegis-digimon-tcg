import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] For the turn, 1 of your Digimon gets +3000 DP and can also attack your opponent's unsuspended Digimon with no digivolution cards.",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: 3000,
          duration: "forTheTurn",
        },
        {
          effectTextPart:
            "[Main] For the turn, 1 of your Digimon gets +3000 DP and can also attack your opponent's unsuspended Digimon with no digivolution cards.",
          kind: "GrantCanAttackUnsuspended",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 1,
            sameTarget: true,
          },
          duration: "forTheTurn",
          noDigivolutionCards: true,
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "AddToHandSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT7-095", compiled);
