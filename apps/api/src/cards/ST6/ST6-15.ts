import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] You may delete 1 of your Digimon to delete 1 of your opponent's level 4 or lower Digimon.",
          payCostBeforeOptional: false,
          kind: "Delete",
          target: {
            filter: { controller: "opponent", kind: ["Digimon"], levelComparison: { op: "lte", value: 4 } },
            count: 1,
          },
          cost: {
            kind: "deleteOwn",
            target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
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
          kind: "Delete",
          target: {
            filter: { controller: "opponent", kind: ["Digimon"], levelComparison: { op: "lte", value: 4 } },
            count: 1,
          },
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST6-15", compiled);
