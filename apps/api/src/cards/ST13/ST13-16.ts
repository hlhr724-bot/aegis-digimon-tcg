import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] You may play 1 Digimon card with [Legend-Arms] in its traits and a play cost of 7 or less in your hand without paying its memory cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controllerDefault: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Legend-Arms"],
                  match: "trait",
                },
              ],
              playCostLte: 7,
            },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
          optional: true,
        },
        { effectTextPart: "Then, place this card in your Battle Area.", kind: "PlaceInBattleAreaSelf" },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          kind: "Trash",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
        },
        {
          effectTextPart:
            "Reveal the top 4 cards of your deck. Place those cards on the top or bottom of your deck in any order.",
          kind: "RevealAdd",
          revealCount: 4,
          add: [],
          rest: "deckTopOrBottom",
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
          effectTextPart:
            "[Security] You may play 1 Digimon card with [Legend-Arms] in its traits and a play cost of 7 or less in your hand without paying its memory cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controllerDefault: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Legend-Arms"],
                  match: "trait",
                },
              ],
              playCostLte: 7,
            },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
          optional: true,
        },
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

registerIrCard("ST13-16", compiled);
