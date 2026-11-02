import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Reveal the top 3 cards of your deck. You may play 1 black Digimon card with a play cost of 4 or less among them without paying its memory cost. Trash the remaining cards.",
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                colors: ["Black"],
                playCostLte: 4,
              },
              count: 1,
              to: "play",
              optional: true,
            },
          ],
          rest: "trash",
        },
        {
          effectTextPart: "Then, place this card in your battle area.",
          kind: "PlaceInBattleAreaSelf",
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

registerIrCard("BT7-105", compiled);
