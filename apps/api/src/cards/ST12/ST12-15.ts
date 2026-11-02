import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          kind: "RevealAdd",
          effectTextPart:
            "[Main] Reveal the top 3 cards of your deck. Add 1 card with [Huckmon] or [Sistermon] in its name or [Royal Knight] in its traits among them to your hand. Trash the rest.",
          revealCount: 3,
          add: [
            {
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Huckmon", "Sistermon"],
                    match: "name",
                  },
                  {
                    tokens: ["Royal Knight"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "trash",
        },
        {
          kind: "PlaceInBattleAreaSelf",
          effectTextPart: "Then, place this card in your Battle Area.",
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "The next time one of your Digimon would digivolve this turn, reduce the digivolution cost by 1.",
          kind: "CostModifier",
          mode: "reduce",
          costType: "digivolve",
          amount: 1,
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: "all",
          },
          duration: "forTheTurn",
          once: true,
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
          kind: "RevealAdd",
          effectTextPart:
            "[Security] Reveal 3 cards from the top of your deck. Add 1 card with [Huckmon] or [Sistermon] in its name or [Royal Knight] in its traits among them to your hand. Trash the rest.",
          revealCount: 3,
          add: [
            {
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Huckmon", "Sistermon"],
                    match: "name",
                  },
                  {
                    tokens: ["Royal Knight"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "trash",
        },
        {
          kind: "PlaceInBattleAreaSelf",
          effectTextPart: "Then, place this card in your Battle Area.",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST12-15", compiled);
