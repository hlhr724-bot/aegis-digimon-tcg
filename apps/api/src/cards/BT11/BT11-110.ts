import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "Replacement",
          event: "wouldBePlayed",
          sourceFilter: { controllerDefault: "mine" },
          actions: [
            {
              kind: "Replacement",
              event: "wouldBePlayed",
              mode: "reduceCost",
              amount: 1,
              raw: "reduce the cost by 1",
              condition: {
                kind: "youHave",
                filter: { zone: "battleArea", controllerDefault: "mine", kind: ["Tamer"], colors: ["Purple"] },
                raw: "you have a purple Tamer in play",
              },
            },
          ],
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Delete 3 of your opponent's unsuspended level 5 or lower Digimon.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              unsuspended: true,
              kind: ["Digimon"],
              levelComparison: { op: "lte", value: 5 },
            },
            count: 3,
          },
        },
      ],
    },
    { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT11-110", compiled);
