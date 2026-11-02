import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] By placing 1 Digimon card with [Aqua]/[Sea Animal]\u00a0in one of its traits from your hand as the bottom digivolution card of 1 of your blue Digimon, return all of your opponent's Digimon with the same level as the placed card to the hand.",
          kind: "Return",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              levelEq: "placedCardLevel",
            },
            count: "all",
          },
          to: "hand",
          allowCostWithoutTarget: true,
          cost: {
            kind: "place",
            target: {
              filter: {
                controller: "mine",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Aqua", "Sea Animal"],
                    match: "traitContains",
                  },
                ],
              },
              count: 1,
              from: ["hand"],
            },
            raw: "By placing 1 Digimon card with [Aqua]/[Sea Animal] in one of its traits from your hand as the bottom digivolution card of 1 of your blue Digimon",
            underFilter: {
              controller: "mine",
              kind: ["Digimon"],
              colors: ["Blue"],
            },
            destination: "digivolutionStack",
            position: "bottom",
            host: "target",
            storeAs: "placedCardLevel",
          },
          optional: true,
          abortOnDecline: true,
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "Return",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              superlative: "lowestLevel",
            },
            count: "all",
          },
          to: "hand",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX6-066", compiled);
