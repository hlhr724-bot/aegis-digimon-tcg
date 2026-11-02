import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenTrashedFromHand",
          bySourceController: "mine",
          sourceFilter: {
            isSelfRef: true,
          },
          actions: [
            {
              kind: "Draw",
              controller: "mine",
              amount: 1,
            },
          ],
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] You may play 1 purple level 4 or lower Digimon card from your trash without paying its memory cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              colors: ["Purple"],
              levelComparison: {
                op: "lte",
                value: 4,
              },
            },
            count: 1,
          },
          from: ["trash"],
          payCost: false,
          optional: true,
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

registerIrCard("BT6-108", compiled);
