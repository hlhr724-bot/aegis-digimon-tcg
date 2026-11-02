import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Delete 1 of your opponent's Digimon with 15000 DP or less. For each of your opponent's security cards, remove 2000 from this DP deletion effect's maximum.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              dp: {
                op: "lte",
                value: 15000,
              },
            },
            count: 1,
          },
          dpCeilingScaling: {
            amount: -2000,
            per: 1,
            filter: {
              controller: "opponent",
            },
            unit: "security",
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

registerIrCard("BT15-089", compiled);
export { compiled };
