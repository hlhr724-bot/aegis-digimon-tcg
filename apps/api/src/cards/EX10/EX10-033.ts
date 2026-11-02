import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        {
          keyword: "Fragment",
          amount: 3,
          raw: "＜Fragment (3)＞",
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "PlaceUnder",
          position: "bottom",
          target: {
            filter: {
              zone: "trash",
              controller: "mine",
              nameOrTrait: [
                {
                  tokens: ["Mineral", "Rock"],
                  match: "trait",
                },
              ],
            },
            count: 3,
            upTo: true,
            minimum: 1,
            from: ["trash"],
          },
        },
      ],
      frequency: "OncePerTurn",
      sharedUseKey: "ir-shared-0",
      optional: true,
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "PlaceUnder",
          position: "bottom",
          target: {
            filter: {
              zone: "trash",
              controller: "mine",
              nameOrTrait: [
                {
                  tokens: ["Mineral", "Rock"],
                  match: "trait",
                },
              ],
            },
            count: 3,
            upTo: true,
            minimum: 1,
            from: ["trash"],
          },
        },
      ],
      frequency: "OncePerTurn",
      sharedUseKey: "ir-shared-0",
      optional: true,
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "CostModifier",
          optional: true,
          mode: "reduce",
          costType: "play",
          amount: 2,
          existingPermanent: true,
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          duration: "untilOpponentTurnEnd",
          cost: {
            kind: "trash",
            target: {
              filter: {
                controller: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Mineral", "Rock"],
                    match: "trait",
                  },
                ],
              },
              count: 3,
              upTo: true,
              minimum: 1,
              from: ["digivolutionCards"],
            },
            raw: "By trashing up to 3 [Mineral] or [Rock] trait cards from any of your Digimon's digivolution cards",
          },
          abortOnDecline: true,
          scaling: {
            per: 1,
            usePaidCount: true,
            unit: "cards",
          },
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "CostModifier",
          optional: true,
          mode: "reduce",
          costType: "play",
          amount: 2,
          existingPermanent: true,
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          duration: "untilOpponentTurnEnd",
          cost: {
            kind: "trash",
            target: {
              filter: {
                controller: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Mineral", "Rock"],
                    match: "trait",
                  },
                ],
              },
              count: 3,
              upTo: true,
              minimum: 1,
              from: ["digivolutionCards"],
            },
            raw: "By trashing up to 3 [Mineral] or [Rock] trait cards from any of your Digimon's digivolution cards",
          },
          abortOnDecline: true,
          scaling: {
            per: 1,
            usePaidCount: true,
            unit: "cards",
          },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX10-033", compiled);

export { compiled };
