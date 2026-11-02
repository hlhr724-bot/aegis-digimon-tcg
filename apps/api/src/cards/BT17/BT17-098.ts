import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Reveal the top 3 cards of your deck. Add 1 card with [Pulsemon] in its text among them to the hand. Return the rest to the bottom of the deck.",
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Pulsemon"],
                    match: "text",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
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
            "By placing the top card of 1 of your level 4 or higher Digimon with [Pulsemon] in its text on top of your security stack, gain 2 memory.",
          kind: "GainMemory",
          amount: 2,
          cost: {
            kind: "place",
            targetIsPermanent: true,
            detachPermanentTop: true,
            target: {
              filter: {
                controller: "mine",
                kind: ["Digimon"],
                levelComparison: { op: "gte", value: 4 },
                nameOrTrait: [{ tokens: ["Pulsemon"], match: "text" }],
              },
              count: 1,
            },
            destination: "security",
            position: "top",
            raw: "By placing the top card of 1 of your level 4 or higher Digimon with [Pulsemon] in its text on top of your security stack",
          },
          optional: true,
          abortOnDecline: true,
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
            "[Security] Reveal the top 3 cards of your deck. Add 1 card with [Pulsemon] in its text among them to the hand. Return the rest to the bottom of the deck.",
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Pulsemon"],
                    match: "text",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
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

registerIrCard("BT17-098", compiled);
