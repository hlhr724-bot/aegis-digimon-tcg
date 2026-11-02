import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourMainPhase",
      actions: [
        {
          kind: "GainMemory",
          amount: 1,
          condition: {
            kind: "opponentHas",
            filter: {
              controllerDefault: "opponent",
              kind: ["Digimon"],
            },
            raw: "your opponent has a Digimon",
          },
        },
      ],
    },
    {
      trigger: "EndOfYourTurn",
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
            nameOrTrait: [
              {
                tokens: ["LordKnightmon"],
                match: "nameExact",
              },
            ],
          },
          from: ["hand"],
          useAlternateCost: true,
          reduceCost: 3,
          payCost: true,
          optional: true,
          cost: {
            kind: "deleteOwn",
            optional: true,
            target: {
              filter: {
                controller: "mine",
                excludeSelf: true,
                kind: ["Digimon", "Tamer"],
                nameOrTrait: [
                  {
                    tokens: ["Knightmon"],
                    match: "text",
                  },
                  {
                    tokens: ["CS"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
            },
            raw: "By deleting 1 of your other Digimon or Tamers with [Knightmon] in its text or the [CS] trait",
          },
          abortOnDecline: true,
        },
      ],
      frequency: "OncePerTurn",
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          payCost: false,
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT22-090", compiled);
