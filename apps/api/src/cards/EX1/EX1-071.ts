import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          condition: {
            kind: "youHave",
            filter: {
              zone: "battleArea",
              controllerDefault: "mine",
              kind: ["Tamer"],
            },
            raw: "you have a Tamer in play",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] The next time one of your Digimon digivolves this turn, you may trash 1 Digimon card in your hand of the same color as the digivolving Digimon to reduce the memory cost of the digivolution by 4.",
          payCostBeforeOptional: false,
          kind: "CostModifier",
          mode: "reduce",
          costType: "digivolve",
          amount: 4,
          duration: "nextDigivolveThisTurn",
          cost: {
            kind: "trash",
            raw: "by trashing 1 Digimon card in your hand of the same color as the digivolving Digimon",
          },
          optional: true,
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "AddToHandSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX1-071", compiled);
