import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Choose 1 of your level 4 or higher Digimon with [Shoutmon] in its name.",
          kind: "SelectBind",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              levelComparison: {
                op: "gte",
                value: 4,
              },
              nameOrTrait: [
                {
                  tokens: ["Shoutmon"],
                  match: "name",
                },
              ],
            },
            count: 1,
            bindAs: "selected",
          },
        },
        {
          effectTextPart: "Delete 1 of your opponent's Digimon with DP less than or equal to the chosen Digimon.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              relativeTo: {
                selectionRef: "selected",
                attr: "dp",
                op: "lte",
              },
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
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "You may add 1 Digimon card with [Xros Heart] in its traits among them to your hand",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Xros Heart"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "play 1 [Taiki Kudo] among them without paying its memory cost.",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Taiki Kudo"],
                    match: "name",
                  },
                ],
              },
              count: 1,
              to: "play",
            },
          ],
          rest: "deckBottom",
          optionalAfterReveal: true,
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT10-096", compiled);
