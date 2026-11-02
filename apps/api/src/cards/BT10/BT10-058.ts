import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 4,
          add: [
            {
              effectTextPart: "with [Twilight] in their traits among them to your hand.",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [{ tokens: ["Twilight"], match: "trait" }],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "Add 2 cards that are either black with [Knightmon] or [DeadlyAxemon] in their names",
              filter: {
                controllerDefault: "mine",
                colors: ["Black"],
                nameOrTrait: [{ tokens: ["Knightmon", "DeadlyAxemon"], match: "name" }],
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

registerIrCard("BT10-058", compiled);
