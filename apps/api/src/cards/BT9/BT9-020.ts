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
              effectTextPart: "Add 1 card with [Garurumon] or [Omnimon] in its name",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Garurumon", "Omnimon"],
                    match: "name",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 [X Antibody] among them to your hand.",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["X Antibody"],
                    match: "nameExact",
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
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 card with [Garurumon] or [Omnimon] in its name",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Garurumon", "Omnimon"],
                    match: "name",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 [X Antibody] among them to your hand.",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["X Antibody"],
                    match: "nameExact",
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
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      names: ["Gabumon"],
      cost: 0,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT9-020", compiled);
