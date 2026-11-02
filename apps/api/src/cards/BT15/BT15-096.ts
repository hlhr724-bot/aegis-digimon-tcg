import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Reveal the top 5 cards of your deck. Among them, add 1 card with the [Machine]/[Cyborg] trait to the hand and trash 1 such card. Return the rest to the top of the deck.",
          kind: "RevealAdd",
          revealCount: 5,
          add: [
            {
              effectTextPart: "add 1 card with the [Machine]/[Cyborg] trait to the hand",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Machine", "Cyborg"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "trash 1 such card.",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Machine", "Cyborg"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
              to: "trash",
              requiresMinRevealed: 2,
            },
          ],
          rest: "deckTop",
        },
        {
          effectTextPart: "Then, place this card in the battle area.",
          kind: "PlaceInBattleAreaSelf",
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "You may play 1 level 5 or higher Digimon card with the [Machine]/[Cyborg] trait from your hand with the play cost reduced by 3.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controllerDefault: "mine",
              kind: ["Digimon"],
              levelComparison: {
                op: "gte",
                value: 5,
              },
              nameOrTrait: [
                {
                  tokens: ["Machine", "Cyborg"],
                  match: "trait",
                },
              ],
            },
            count: 1,
          },
          from: ["hand"],
          payCost: true,
          reduceCostBy: 3,
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
          effectTextPart:
            "[Security] Reveal the top 5 cards of your deck. Among them, add 1 card with the [Machine]/[Cyborg] trait to the hand and trash 1 such card. Return the rest to the top of the deck.",
          kind: "RevealAdd",
          revealCount: 5,
          add: [
            {
              effectTextPart: "add 1 card with the [Machine]/[Cyborg] trait to the hand",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Machine", "Cyborg"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "trash 1 such card.",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Machine", "Cyborg"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
              to: "trash",
              requiresMinRevealed: 2,
            },
          ],
          rest: "deckTop",
        },
        {
          effectTextPart: "Then, place this card in the battle area.",
          kind: "PlaceInBattleAreaSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT15-096", compiled);
export { compiled };
