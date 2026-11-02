import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 card with the [Glowing Dawn] trait",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Glowing Dawn"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 green card with the [BEATBREAK] trait among them to the hand.",
              filter: {
                controllerDefault: "mine",
                colors: ["Green"],
                nameOrTrait: [
                  {
                    tokens: ["BEATBREAK"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
    {
      trigger: "Static",
      actions: [],
      isInherited: true,
      keywords: [
        {
          keyword: "Piercing",
          raw: "＜Piercing＞",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 2,
      traits: ["Glowing Dawn"],
      cost: 0,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT25-046", compiled);
