import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          condition: {
            kind: "youHaveNone",
            filter: {
              zone: "battleArea",
              controllerDefault: "mine",
              nameOrTrait: [
                {
                  tokens: ["Treadmill Training"],
                  match: "name",
                },
              ],
            },
            raw: "you don't have [Treadmill Training] in the battle area",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          kind: "RevealAdd",
          effectTextPart:
            "[Main] Reveal the top 2 cards of your deck. Add 1 yellow or black card among them to the hand. Return the rest to the bottom of the deck.",
          revealCount: 2,
          add: [
            {
              filter: {
                controllerDefault: "mine",
                colors: ["Yellow", "Black"],
              },
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
      actions: [
        {
          effectTextPart:
            "1 of your Digimon may digivolve into a yellow or black Digimon card in the hand with the digivolution cost reduced by 2.",
          kind: "Digivolve",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 1,
          },
          into: {
            controllerDefault: "mine",
            kind: ["Digimon"],
            colors: ["Yellow", "Black"],
          },
          from: ["hand"],
          reduceCost: 2,
          payCost: true,
          optional: true,
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
            "[Security] Reveal the top 2 cards of your deck. Add 1 yellow or black card among them to the hand. Return the rest to the bottom of the deck.",
          revealCount: 2,
          add: [
            {
              filter: {
                controllerDefault: "mine",
                colors: ["Yellow", "Black"],
              },
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
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("LM-054", compiled);
