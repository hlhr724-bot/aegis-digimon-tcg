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
            "[Main] Reveal the top 2 cards of your deck. Add 1 red card among them to the hand. Return the rest to the bottom of the deck in any order.",
          revealCount: 2,
          add: [
            {
              filter: { colors: ["Red"] },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
        {
          kind: "PlaceInBattleAreaSelf",
          effectTextPart: "Then, place this card in the battle area.",
        },
      ],
    },
    {
      trigger: "Main",
      keywords: [{ keyword: "Delay", raw: "＜Delay＞" }],
      actions: [
        {
          effectTextPart:
            "1 of your Digimon may digivolve into a red Digimon card in your hand for its digivolution cost. When it would digivolve by this effect, reduce the cost by 2.",
          kind: "Digivolve",
          optional: true,
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 1,
          },
          into: {
            controller: "mine",
            kind: ["Digimon"],
            colors: ["Red"],
          },
          costDelta: -2,
          payCost: true,
          from: ["hand"],
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [
        {
          kind: "PlaceInBattleAreaSelf",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("P-103", compiled);
