import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
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
            kind: "opponentHas",
            filter: {
              controllerDefault: "opponent",
              kind: ["Digimon"],
              levelComparison: {
                op: "gte",
                value: 6,
              },
            },
            raw: "your opponent has a level 6 or higher Digimon",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] 1 of your level 6 Digimon and 1 card in the hand may DNA digivolve into a level 7 Digimon card in your hand.",
          kind: "DnaDigivolve",
          materials: [
            {
              filter: {
                controller: "mine",
                kind: ["Digimon"],
                levels: [6],
              },
              zone: "battleArea",
              count: 1,
            },
            {
              filter: {
                controller: "mine",
              },
              zone: "hand",
              count: 1,
            },
          ],
          into: {
            controllerDefault: "mine",
            kind: ["Digimon"],
            levels: [7],
            zone: "hand",
          },
          payCost: true,
          optional: true,
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          effectTextPart: "[Security] Return 1 level 6 or higher Digimon card from your trash to the hand.",
          kind: "Return",
          target: {
            filter: {
              zone: "trash",
              controller: "mine",
              kind: ["Digimon"],
              levelComparison: {
                op: "gte",
                value: 6,
              },
            },
            count: 1,
          },
          to: "hand",
        },
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

registerIrCard("EX6-072", compiled);
