import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "Replacement",
          event: "wouldBePlayed",
          sourceFilter: { isSelfRef: true },
          actions: [
            {
              kind: "Replacement",
              event: "wouldBePlayed",
              mode: "reduceCost",
              amount: 2,
              raw: "reduce the cost by 2",
              cost: {
                kind: "deleteOwn",
                target: {
                  filter: { controller: "mine", kind: ["Digimon", "DigiEgg"], zone: "breeding", levels: [2] },
                  count: 1,
                },
                raw: "by deleting 1 of your level 2 Digimon in the breeding area",
              },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    },
    { trigger: "Static", actions: [], keywords: [{ keyword: "Blocker", raw: "＜Blocker＞" }] },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "Restrict",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          restriction: "digivolve",
          duration: "permanent",
        },
      ],
    },
    {
      trigger: "OnDeletion",
      actions: [
        {
          kind: "CostGatedBlock",
          optional: true,
          abortOnDecline: true,
          cost: {
            kind: "return",
            target: {
              filter: { zone: "trash", controller: "mine", nameOrTrait: [{ tokens: ["Gizmon"], match: "name" }] },
              count: 2,
            },
            to: "deckBottom",
            orderReturnedCards: true,
            raw: "By returning 2 cards with [Gizmon] in their names from your trash to the bottom of the deck",
          },
          actions: [
            {
              kind: "PlayWithoutCost",
              target: {
                filter: { controller: "mine", nameOrTrait: [{ tokens: ["Gizmon: AT"], match: "nameExact" }] },
                count: 1,
              },
              from: ["trash"],
              payCost: false,
              optional: true,
            },
          ],
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-075", compiled);
