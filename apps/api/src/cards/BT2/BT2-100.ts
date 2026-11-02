import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Suspend 1 of your opponent's Digimon.",
          kind: "Suspend",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
        },
        {
          effectTextPart: "Then 1 of your Digimon gets +2000 DP for the turn.",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: 2000,
          duration: "forTheTurn",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT2-100", compiled);
