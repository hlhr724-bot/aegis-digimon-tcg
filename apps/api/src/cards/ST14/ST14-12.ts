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
              kind: "PlaceInBattleAreaSelf",
            },
          ],
          optional: true,
          raw: "when this card is trashed from the deck, you may place it in the battle area",
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Delete 1 of your opponent's Digimon with the highest level.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              superlative: "highestLevel",
            },
            count: 1,
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "Return 1 purple Digimon card or Tamer card from your trash to your hand.",
          kind: "Return",
          target: {
            filter: {
              zone: "trash",
              controller: "mine",
              kind: ["Digimon", "Tamer"],
              colors: ["Purple"],
            },
            count: 1,
          },
          to: "hand",
        },
      ],
      keywords: [
        {
          keyword: "Delay",
          raw: "＜Delay＞",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              superlative: "highestLevel",
            },
            count: 1,
          },
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST14-12", compiled);
