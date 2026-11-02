import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Delete 1 of your opponent's Digimon with 3000 DP or less.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              dp: {
                op: "lte",
                value: 3000,
              },
            },
            count: 1,
          },
        },
        {
          effectTextPart:
            "If an opponent's Digimon wasn't deleted by this effect, ＜Draw 2＞. (Draw 2 cards from your deck.)",
          kind: "Draw",
          controller: "mine",
          amount: 2,
          condition: {
            kind: "ifThisEffectDidNotDelete",
            raw: "an opponent's Digimon wasn't deleted by this effect",
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

registerIrCard("EX2-067", compiled);
