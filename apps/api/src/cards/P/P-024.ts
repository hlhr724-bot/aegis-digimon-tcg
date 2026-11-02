import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      description:
        "[Main] If you have [Tai Kamiya] in play, you may place 1 of your [Agumon] cards at the bottom of its owner's deck to trigger ＜Draw 3＞. (Draw 3 cards from your deck.) Trash that Digimon's digivolution cards.",
      condition: {
        kind: "youHave",
        filter: {
          zone: "battleArea",
          controllerDefault: "mine",
          nameOrTrait: [
            {
              tokens: ["Tai Kamiya"],
              match: "nameExact",
            },
          ],
        },
        raw: "you have [Tai Kamiya] in play",
      },
      optional: true,
      actions: [
        {
          effectTextPart:
            "[Main] If you have [Tai Kamiya] in play, you may place 1 of your [Agumon] cards at the bottom of its owner's deck to trigger ＜Draw 3＞. (Draw 3 cards from your deck.) Trash that Digimon's digivolution cards.",
          kind: "Return",
          target: {
            filter: {
              controller: "mine",
              nameOrTrait: [
                {
                  tokens: ["Agumon"],
                  match: "nameExact",
                },
              ],
            },
            count: 1,
          },
          to: "deckBottom",
          bindResultAs: "returnedAgumon",
        },
        {
          effectTextPart:
            "[Main] If you have [Tai Kamiya] in play, you may place 1 of your [Agumon] cards at the bottom of its owner's deck to trigger ＜Draw 3＞. (Draw 3 cards from your deck.) Trash that Digimon's digivolution cards.",
          kind: "Draw",
          amount: 3,
          controller: "mine",
          condition: {
            kind: "bindingExists",
            ref: "returnedAgumon",
          },
        },
      ],
    },
    {
      trigger: "Security",
      description: "[Security] Add this card to your hand.",
      actions: [
        {
          kind: "AddToHandSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("P-024", compiled);
