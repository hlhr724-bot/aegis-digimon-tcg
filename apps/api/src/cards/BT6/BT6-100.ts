import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Reveal the top 2 cards of your deck. Place 1 of them on top of your security stack face down. Add the remaining card to your hand.",
          kind: "RevealAdd",
          revealCount: 2,
          add: [
            {
              effectTextPart: "Place 1 of them on top of your security stack face down.",
              filter: {
                controllerDefault: "mine",
              },
              count: 1,
              to: "security",
              toTop: true,
              faceDown: true,
            },
            {
              effectTextPart: "Add the remaining card to your hand.",
              filter: {
                controllerDefault: "mine",
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
        {
          effectTextPart: "Then, place this card in your battle area.",
          kind: "PlaceInBattleAreaSelf",
        },
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
        { effectTextPart: "Gain 3 memory.", kind: "GainMemory", amount: 3 },
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
          kind: "PlaceInBattleAreaSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT6-100", compiled);
