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
                  tokens: ["Image Training"],
                  match: "name",
                },
              ],
            },
            raw: "you don't have [Image Training] in the battle area",
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
            "[Main] Reveal the top 2 cards of your deck. Add 1 purple or blue card among them to the hand. Return the rest to the bottom of the deck.",
          revealCount: 2,
          add: [
            {
              filter: {
                controllerDefault: "mine",
                colors: ["Blue", "Purple"],
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
            "1 of your Digimon may digivolve into a purple or blue Digimon card in the hand with the digivolution cost reduced by 2.",
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
            colors: ["Blue", "Purple"],
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
            "[Security] Reveal the top 2 cards of your deck. Add 1 purple or blue card among them to the hand. Return the rest to the bottom of the deck.",
          revealCount: 2,
          add: [
            {
              filter: {
                controllerDefault: "mine",
                colors: ["Blue", "Purple"],
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

registerIrCard("LM-056", compiled);
