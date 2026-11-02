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
              effectTextPart: "add 1 card with the [DM] trait to the hand",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["DM"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "place 1 card with the [Ver.5] trait face down as the bottom digivolution card",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Ver.5"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
              to: "placeUnder",
              faceDown: true,
              underFilter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["DM"],
                    match: "trait",
                  },
                ],
              },
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
          keyword: "Retaliation",
          raw: "＜Retaliation＞",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 2,
      traits: ["DM"],
      cost: 0,
      isAlternate: true,
    },
  ],
};

registerIrCard("EX9-058", compiled);
