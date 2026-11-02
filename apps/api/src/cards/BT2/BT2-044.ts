import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 level 5 or lower Digimon card",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                levelComparison: {
                  op: "lte",
                  value: 5,
                },
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 green Tamer card among them to your hand.",
              filter: {
                controllerDefault: "mine",
                kind: ["Tamer"],
                colors: ["Green"],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT2-044", compiled);
