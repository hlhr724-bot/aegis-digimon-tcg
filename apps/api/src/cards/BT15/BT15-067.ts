import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        {
          keyword: "Blocker",
          raw: "＜Blocker＞",
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
              controller: "opponent",
              suspended: true,
              kind: ["Digimon", "Tamer"],
            },
            count: 1,
          },
          to: "deckBottom",
          condition: {
            kind: "selfDigivolutionStackHasTrait",
            filter: {
              kind: ["Tamer"],
              nameOrTrait: [
                {
                  tokens: ["DigiPolice"],
                  match: "trait",
                },
              ],
            },
            raw: "a Tamer card with the [DigiPolice] trait is in this Digimon's digivolution cards",
          },
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSuspended",
          sourceFilter: {
            isSelfRef: true,
          },
          actions: [
            {
              kind: "PlayWithoutCost",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  dp: {
                    op: "lte",
                    value: 5000,
                  },
                  nameOrTrait: [
                    {
                      tokens: ["Beast Dragon", "DigiPolice"],
                      match: "trait",
                    },
                  ],
                },
                count: 1,
              },
              from: ["hand"],
              payCost: false,
              optional: true,
            },
          ],
        },
      ],
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 5, traits: ["X Antibody", "DigiPolice"], cost: 4, isAlternate: true }],
};

registerIrCard("BT15-067", compiled);
export { compiled };
