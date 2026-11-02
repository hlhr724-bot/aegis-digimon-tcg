import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] You may place 1 red level 4 or lower Digimon card from your hand under 1 of your Digimon as its bottom digivolution card.",
          kind: "PlaceUnder",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              colors: ["Red"],
              levelComparison: {
                op: "lte",
                value: 4,
              },
            },
            count: 1,
            from: ["hand"],
          },
          underFilter: {
            controller: "mine",
            kind: ["Digimon"],
          },
          position: "bottom",
          optional: true,
          abortOnDecline: true,
        },
        {
          effectTextPart: "If you do, trigger ＜Draw 2＞. (Draw 2 cards from your deck.)",
          kind: "Draw",
          controller: "mine",
          amount: 2,
          condition: {
            kind: "ifThisEffectActed",
            raw: "if you do",
          },
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

registerIrCard("BT5-094", compiled);
