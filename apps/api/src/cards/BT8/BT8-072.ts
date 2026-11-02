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
              effectTextPart: "Add 1 Tamer card among them to your hand,",
              filter: {
                controllerDefault: "mine",
                kind: ["Tamer"],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "trash 1 purple Digimon card among them.",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                colors: ["Purple"],
              },
              count: 1,
              to: "trash",
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

registerIrCard("BT8-072", compiled);
