import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Play 1 purple level 5 Digimon card from your trash without paying its memory cost. If there are 10 or more cards in your trash, you may play 1 Digimon card with [Lucemon] in its name without paying its memory cost instead.",
          kind: "Modal",
          choose: 1,
          labels: ["Play a purple level 5 Digimon", "Play a Digimon with Lucemon in its name instead"],
          options: [
            [
              {
                kind: "PlayWithoutCost",
                target: {
                  filter: {
                    controller: "mine",
                    kind: ["Digimon"],
                    colors: ["Purple"],
                    levels: [5],
                  },
                  count: 1,
                },
                from: ["trash"],
                payCost: false,
              },
            ],
            [
              {
                kind: "PlayWithoutCost",
                target: {
                  filter: {
                    controller: "mine",
                    kind: ["Digimon"],
                    nameOrTrait: [
                      {
                        tokens: ["Lucemon"],
                        match: "name",
                      },
                    ],
                  },
                  count: 1,
                },
                from: ["trash"],
                payCost: false,
              },
            ],
          ],
          optionConditions: [
            {
              kind: "selfHasMinTrash",
              count: 1,
              filter: { kind: ["Digimon"], colors: ["Purple"], levels: [5] },
            },
            {
              kind: "allOf",
              conditions: [
                {
                  kind: "zoneCount",
                  seat: "mine",
                  zone: "trash",
                  op: "gte",
                  value: 10,
                  raw: "there are 10 or more cards in your trash",
                },
                {
                  kind: "selfHasMinTrash",
                  count: 1,
                  filter: { kind: ["Digimon"], nameOrTrait: [{ tokens: ["Lucemon"], match: "name" }] },
                },
              ],
            },
          ],
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

registerIrCard("BT7-109", compiled);
