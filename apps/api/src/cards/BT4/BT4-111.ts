import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Gain 1 memory for every 10 cards in your trash.",
          kind: "GainMemory",
          amount: 1,
          scaling: {
            per: 10,
            filter: {
              zone: "trash",
              controller: "mine",
            },
            unit: "trash",
          },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "GainMemory",
          amount: 2,
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT4-111", compiled);
