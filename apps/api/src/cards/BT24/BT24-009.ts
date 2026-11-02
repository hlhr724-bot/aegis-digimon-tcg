import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "Draw",
          controller: "mine",
          amount: 2,
          cost: {
            kind: "trash",
            target: {
              filter: {
                zone: "hand",
                controller: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Demon", "Shaman", "Titan"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
            },
            raw: "By trashing 1 card with the [Demon], [Shaman] or [Titan] trait from your hand",
          },
          optional: true,
          abortOnDecline: true,
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenHandTrashed",
          actions: [
            {
              kind: "Digivolve",
              target: {
                filter: {
                  isSelfRef: true,
                },
                count: 1,
                isSelf: true,
              },
              into: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Titamon"],
                    match: "nameExact",
                  },
                  {
                    tokens: ["Titan"],
                    match: "trait",
                  },
                ],
              },
              from: ["trash"],
              payCost: true,
              useAlternateCost: true,
              reduceCost: 1,
              optional: true,
              condition: {
                kind: "selfHasTrait",
                filter: {
                  nameOrTrait: [
                    {
                      tokens: ["Demon", "Titan"],
                      match: "trait",
                    },
                  ],
                },
                raw: "this Digimon has the [Demon] or [Titan] trait",
              },
            },
          ],
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
      names: ["Tsunomon"],
      cost: 0,
      isAlternate: true,
    },
    {
      level: 2,
      traits: ["TS"],
      cost: 0,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT24-009", compiled);
