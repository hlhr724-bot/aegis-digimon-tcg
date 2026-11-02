import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "If a Digimon with 13000 DP or more is deleted by this effect, trash the top card of your opponent's security stack.",
          kind: "SubTrigger",
          event: "onDeletionOf",
          sourceFilter: {
            controller: "opponent",
            kind: ["Digimon"],
            dp: {
              op: "gte",
              value: 13000,
            },
          },
          actions: [
            {
              kind: "SecurityManipulation",
              op: "trashTop",
              controller: "opponent",
              amount: 1,
            },
          ],
        },
        {
          effectTextPart: "[Main] Delete 1 of your opponent's Digimon with the highest DP.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              superlative: "highestDP",
            },
            count: 1,
          },
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

registerIrCard("EX4-065", compiled);
