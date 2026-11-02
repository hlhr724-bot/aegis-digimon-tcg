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
              effectTextPart: "Add 1 Digimon card with [Chaosmon] in its name or the [ACCEL] trait",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Chaosmon"],
                    match: "name",
                  },
                  {
                    tokens: ["ACCEL"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 Option card with the [ACCEL] trait among them to the hand.",
              filter: {
                controllerDefault: "mine",
                kind: ["Option"],
                nameOrTrait: [
                  {
                    tokens: ["ACCEL"],
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
          keyword: "Barrier",
          raw: "＜Barrier＞",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      names: ["Frimon"],
      cost: 0,
      isAlternate: true,
    },
    {
      level: 2,
      traits: ["ACCEL"],
      cost: 0,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT20-030", compiled);
