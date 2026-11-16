import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "Return",
          target: {
            filter: {
              zone: "trash",
              controller: "mine",
              kind: ["Digimon", "Tamer", "Option"],
              nameOrTrait: [{ tokens: ["CS"], match: "trait" }],
            },
            count: 1,
            upTo: true,
          },
          to: "hand",
          cost: {
            kind: "trash",
            optional: true,
            target: {
              filter: {
                zone: "hand",
                controller: "mine",
              },
              count: 1,
            },
            raw: "By trash 1 card in your hand",
          },
          optional: true,
          abortOnDecline: true,
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
              nameOrTrait: [{ tokens: ["Hudie"], match: "trait" }],
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
          target: { filter: { boundRef: "playedHudie", kind: ["Digimon"] }, count: "all" },
          restriction: "digivolve",
          duration: "permanent",
        },
        { kind: "DelayedDelete", timing: "endOfOpponentTurn" },
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

registerIrCard("BT23-017", compiled);
