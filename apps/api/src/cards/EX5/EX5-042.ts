import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        {
          keyword: "Fortitude",
          raw: "＜Fortitude＞",
        },
      ],
    },
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 1,
          add: [
            {
              effectTextPart: "a level 5 or lower Digimon card with ＜Fortitude＞, play it without paying the cost.",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                levelComparison: {
                  op: "lte",
                  value: 5,
                },
                keywords: ["Fortitude"],
              },
              count: 1,
              to: "play",
            },
            {
              effectTextPart: "Add the rest to your hand.",
              filter: {},
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 1,
          add: [
            {
              effectTextPart: "a level 5 or lower Digimon card with ＜Fortitude＞, play it without paying the cost.",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                levelComparison: {
                  op: "lte",
                  value: 5,
                },
                keywords: ["Fortitude"],
              },
              count: 1,
              to: "play",
            },
            {
              effectTextPart: "Add the rest to your hand.",
              filter: {},
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "GainKeyword",
          target: {
            filter: {
              digivolutionCards: "none",
              controller: "mine",
              kind: ["Digimon"],
              keywords: ["Fortitude"],
            },
            count: "all",
          },
          keyword: {
            keyword: "Rush",
            raw: "＜Rush＞",
          },
          duration: "permanent",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX5-042", compiled);
