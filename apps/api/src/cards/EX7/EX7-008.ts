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
              effectTextPart: "Add 1 card with [Three Musketeers] in its text",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Three Musketeers"],
                    match: "text",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 Option card with a cost of 6 among them to the hand.",
              filter: {
                controllerDefault: "mine",
                kind: ["Option"],
                playCostOneOf: [6],
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
      trigger: "YourTurn",
      actions: [
        {
          kind: "ModifyDP",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          amount: 2000,
          duration: "permanent",
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 2,
      texts: ["Three Musketeers"],
      cost: 0,
      isAlternate: true,
    },
  ],
};

registerIrCard("EX7-008", compiled);
