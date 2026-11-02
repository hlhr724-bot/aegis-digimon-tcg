import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "Digivolve",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          into: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Gallantmon"], match: "nameExact" }] },
          payCost: true,
          from: ["hand"],
          costOverride: 4,
          ignoreRequirements: true,
          condition: {
            kind: "opponentHas",
            filter: {
              zone: "battleArea",
              controllerDefault: "opponent",
              kind: ["Digimon"],
              levelComparison: { op: "gte", value: 6 },
            },
            raw: "your opponent has a level 6 or higher Digimon in play",
          },
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "onDeletionOf",
          notSimultaneous: true,
          sourceFilter: { controller: "opponent", kind: ["Digimon"] },
          actions: [{ kind: "Draw", controller: "mine", amount: 1 }],
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST7-03", compiled);
