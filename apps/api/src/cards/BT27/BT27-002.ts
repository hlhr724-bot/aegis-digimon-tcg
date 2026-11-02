import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenAttacking",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              hostFilter: { isSelfRef: true },
              levelComparison: { op: "lte", value: 4 },
              nameOrTrait: [{ tokens: ["Aquatic", "DATA SQUAD"], match: "trait" }],
            },
            count: 1,
          },
          from: ["digivolutionCards"],
          payCost: true,
          reduceCostBy: 1,
          optional: true,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-002", compiled);
