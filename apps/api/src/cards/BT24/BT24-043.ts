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
              effectTextPart:
                "Add 1 Digimon card with the [Shaman] trait or with [Beast], [Animal] or [Sovereign], other than [Sea Animal], in any of its traits",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                or: [
                  {
                    nameOrTrait: [
                      {
                        tokens: ["Shaman"],
                        match: "trait",
                      },
                    ],
                  },
                  {
                    nameOrTrait: [
                      {
                        tokens: ["Beast", "Animal", "Sovereign"],
                        match: "traitContains",
                      },
                    ],
                    excludeNameOrTrait: [
                      {
                        tokens: ["Sea Animal"],
                        match: "traitContains",
                      },
                    ],
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 card with the [TS] trait among them to the hand.",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["TS"],
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
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "Suspend",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 2,
      traits: ["TS"],
      cost: 0,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT24-043", compiled);
