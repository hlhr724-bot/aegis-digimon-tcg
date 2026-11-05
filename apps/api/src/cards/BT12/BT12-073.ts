import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

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
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Evil", "Wizard"],
                  match: "trait",
                },
                {
                  tokens: ["Demon Lord"],
                  match: "trait",
                },
              ],
            },
            count: 1,
          },
          to: "hand",
          cost: {
            kind: "trash",
            target: {
              filter: {
                zone: "hand",
                controller: "mine",
                kind: ["Option"],
              },
              count: 1,
            },
            raw: "By trashing 1 Option card in your hand",
            optional: true,
          },
          optional: true,
          abortOnDecline: true,
          payCostBeforeOptional: true,
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Return",
          target: {
            filter: {
              zone: "trash",
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Evil", "Wizard"],
                  match: "trait",
                },
                {
                  tokens: ["Demon Lord"],
                  match: "trait",
                },
              ],
            },
            count: 1,
          },
          to: "hand",
          cost: {
            kind: "trash",
            target: {
              filter: {
                zone: "hand",
                controller: "mine",
                kind: ["Option"],
              },
              count: 1,
            },
            raw: "By trashing 1 Option card in your hand",
            optional: true,
          },
          optional: true,
          abortOnDecline: true,
          payCostBeforeOptional: true,
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "TrashTopDeck",
          controller: "mine",
          amount: 2,
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
      cost: 0,
      isAlternate: true,
      namesExact: ["Impmon"],
    },
  ],
};

registerIrCard("BT12-073", compiled);
