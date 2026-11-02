import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenTrashedFromDeck",
          sourceFilter: {
            isSelfRef: true,
          },
          actions: [
            {
              kind: "AddToHandSelf",
            },
          ],
          raw: "When this card is trashed from your deck, return it to your hand",
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Delete 1 of your opponent's level 6 or lower Digimon. If there are 10 or more cards in your trash, add 1 to the level of the Digimon you can select with this effect.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              levelComparison: {
                op: "lte",
                value: 7,
              },
            },
            count: 1,
          },
          condition: {
            kind: "zoneCount",
            seat: "mine",
            zone: "trash",
            op: "gte",
            value: 10,
            raw: "there are 10 or more cards in your trash",
          },
        },
        {
          effectTextPart:
            "[Main] Delete 1 of your opponent's level 6 or lower Digimon. If there are 10 or more cards in your trash, add 1 to the level of the Digimon you can select with this effect.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              levelComparison: {
                op: "lte",
                value: 6,
              },
            },
            count: 1,
          },
          condition: {
            kind: "zoneCount",
            seat: "mine",
            zone: "trash",
            op: "lte",
            value: 9,
            raw: "there are fewer than 10 cards in your trash",
          },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "ActivateMain",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT10-108", compiled);
