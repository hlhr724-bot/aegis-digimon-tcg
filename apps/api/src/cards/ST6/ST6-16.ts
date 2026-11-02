import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] You may play 1 purple level 3 Digimon card and 1 purple level 4 Digimon card from your trash without paying their memory costs. Any [On Play] effects on Digimon played with this effect don't activate.",
          kind: "PlayWithoutCost",
          target: { filter: { controller: "mine", kind: ["Digimon"], colors: ["Purple"], levels: [3] }, count: 1 },
          from: ["trash"],
          payCost: false,
          optional: true,
          suppressOnPlayEffects: true,
        },
        {
          effectTextPart:
            "[Main] You may play 1 purple level 3 Digimon card and 1 purple level 4 Digimon card from your trash without paying their memory costs. Any [On Play] effects on Digimon played with this effect don't activate.",
          kind: "PlayWithoutCost",
          target: { filter: { controller: "mine", kind: ["Digimon"], colors: ["Purple"], levels: [4] }, count: 1 },
          from: ["trash"],
          payCost: false,
          optional: true,
          suppressOnPlayEffects: true,
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              colors: ["Purple"],
              levelComparison: { op: "lte", value: 4 },
            },
            count: 1,
          },
          from: ["trash"],
          payCost: false,
          optional: true,
          suppressOnPlayEffects: true,
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST6-16", compiled);
