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
              effectTextPart: "Add 1 card with the [Hudie] trait",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Hudie"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 Tamer card or Option card with the [CS] trait among them to the hand.",
              filter: {
                controllerDefault: "mine",
                kind: ["Tamer", "Option"],
                nameOrTrait: [
                  {
                    tokens: ["CS"],
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
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              playCostLte: 5,
              nameOrTrait: [
                {
                  tokens: ["Hudie"],
                  match: "trait",
                },
              ],
            },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
          optional: true,
          abortOnDecline: true,
          bindResultAs: "playedHudie",
        },
        {
          kind: "Restrict",
          target: {
            filter: {
              boundRef: "playedHudie",
              kind: ["Digimon"],
            },
            count: "all",
          },
          restriction: "digivolve",
          duration: "permanent",
        },
        {
          kind: "DelayedDelete",
          timing: "endOfOpponentTurn",
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
      traits: ["CS"],
      cost: 0,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT23-048", compiled);
