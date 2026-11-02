import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Play 1 level 5 purple Digimon card from your trash without paying its memory cost. Any [On Play] effects on Digimon played with this effect don't activate.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              colors: ["Purple"],
              levels: [5],
            },
            count: 1,
          },
          from: ["trash"],
          payCost: false,
          suppressOnPlayEffects: true,
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "ActivateMain",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT3-110", compiled);
