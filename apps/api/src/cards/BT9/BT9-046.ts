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
              effectTextPart: "Add 1 card with [Insectoid] or [Machine] in its traits",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Insectoid", "Machine"],
                    match: "trait",
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
              effectTextPart: "Add 1 card with [Insectoid] or [Machine] in its traits",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Insectoid", "Machine"],
                    match: "trait",
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
      names: ["Kokuwamon"],
      cost: 0,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT9-046", compiled);
