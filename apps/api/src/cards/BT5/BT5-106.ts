import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] You may delete 1 of your Digimon to unsuspend 1 of your purple Digimon.",
          payCostBeforeOptional: false,
          kind: "Unsuspend",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              colors: ["Purple"],
              suspended: true,
            },
            count: 1,
          },
          cost: {
            kind: "deleteOwn",
            target: {
              filter: {
                controller: "mine",
                kind: ["Digimon"],
              },
              count: 1,
            },
            raw: "by deleting 1 of your Digimon",
          },
          optional: true,
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
              levels: [3],
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

registerIrCard("BT5-106", compiled);
