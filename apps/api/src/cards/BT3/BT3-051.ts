import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 level 5",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                levels: [5],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 level 6 Digimon card among them to your hand.",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                levels: [6],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "trash",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT3-051", compiled);
