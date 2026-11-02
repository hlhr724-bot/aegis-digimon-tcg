import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
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
            kind: "youHave",
            filter: {
              controllerDefault: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Deva", "Four Sovereigns"],
                  match: "trait",
                },
              ],
            },
            raw: "you have a Digimon with the [Deva]/[Four Sovereigns] trait",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Reveal the top 3 cards of your deck. Place 1 card with [Deva]/[Four Sovereigns]\u00a0trait among them as the bottom digivolution card of 1 of your Digimon or add it to your hand. Return the rest to the top or bottom of the deck.",
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Deva", "Four Sovereigns"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
              to: "placeUnder",
              underFilter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
              },
              orDispositions: [
                {
                  to: "hand",
                },
              ],
            },
          ],
          rest: "deckTopOrBottom",
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
registerIrCard("EX5-071", compiled);
