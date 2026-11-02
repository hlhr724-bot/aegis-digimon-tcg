import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Reveal the top 6 cards of your deck. You may add 2 cards with [Blue Flare] in their traits among them to your hand, and play 1 [Kiriha Aonuma] among them without paying its memory cost. Place the rest at the bottom of your deck in any order.",
          kind: "RevealAdd",
          revealCount: 6,
          reserveForLaterSlots: true,
          add: [
            {
              effectTextPart: "You may add 2 cards with [Blue Flare] in their traits among them to your hand",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Blue Flare"],
                    match: "trait",
                  },
                ],
              },
              count: 2,
              to: "hand",
            },
            {
              effectTextPart: "play 1 [Kiriha Aonuma] among them without paying its memory cost.",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Kiriha Aonuma", "KirihaAonuma"],
                    match: "name",
                  },
                ],
              },
              count: 1,
              to: "play",
            },
          ],
          rest: "deckBottom",
          optional: true,
        },
        {
          effectTextPart: "Then, place this card in your Battle Area.",
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

registerIrCard("BT10-097", compiled);
