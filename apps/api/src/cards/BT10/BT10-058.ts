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
              filter: {
                controllerDefault: "mine",
                colors: ["Black"],
                nameOrTrait: [{ tokens: ["Knightmon", "DeadlyAxemon"], match: "name" }],
              },
              orFilters: [
                {
                  controllerDefault: "mine",
                  nameOrTrait: [{ tokens: ["Twilight"], match: "trait" }],
                },
              ],
              count: 2,
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
