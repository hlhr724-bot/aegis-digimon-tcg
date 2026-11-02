import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          kind: "TrashTopDeck",
          effectTextPart: "[Main] Trash the top 2 cards of your deck and ＜Draw 1＞.",
          controller: "mine",
          amount: 2,
        },
        {
          kind: "Draw",
          controller: "mine",
          amount: 1,
        },
        {
          kind: "PlaceInBattleAreaSelf",
          effectTextPart: "Then, place this card in your battle area.",
        },
      ],
    },
    {
      trigger: "Main",
      actions: [{ effectTextPart: "Gain 2 memory.", kind: "GainMemory", amount: 2 }],
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
          kind: "PlaceInBattleAreaSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT8-108", compiled);
