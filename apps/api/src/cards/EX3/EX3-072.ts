import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Delete 1 of your opponent's level 4 or lower Digimon. By deleting 1 of your Digimon, delete 1 of your opponent's level 6 or lower Digimon instead.",
          kind: "Modal",
          choose: 1,
          options: [
            [
              {
                kind: "Delete",
                target: {
                  filter: {
                    controller: "opponent",
                    kind: ["Digimon"],
                    levelComparison: { op: "lte", value: 4 },
                  },
                  count: 1,
                },
                raw: "Delete 1 opponent's level 4 or lower Digimon",
              },
            ],
            [
              {
                kind: "Delete",
                target: {
                  filter: {
                    controller: "opponent",
                    kind: ["Digimon"],
                    levelComparison: { op: "lte", value: 6 },
                  },
                  count: 1,
                },
                cost: {
                  kind: "deleteOwn",
                  target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
                  raw: "By deleting 1 of your Digimon",
                },
                allowCostWithoutTarget: true,
                raw: "Delete 1 of your Digimon to delete 1 opponent's level 6 or lower Digimon instead",
              },
            ],
          ],
          optionConditions: [
            {
              kind: "opponentHas",
              filter: {
                kind: ["Digimon"],
                levelComparison: { op: "lte", value: 4 },
              },
            },
            { kind: "youHave", filter: { kind: ["Digimon"] } },
          ],
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: { controller: "mine", nameOrTrait: [{ tokens: ["Guilmon"], match: "nameExact" }] },
            count: 1,
          },
          from: ["trash"],
          payCost: false,
          optional: true,
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX3-072", compiled);
