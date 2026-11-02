import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Reveal the top 4 cards of your deck. Add 1 [Four Great Dragons] trait or 1 yellow card among them to the hand. Return the rest to the bottom of the deck.",
          kind: "RevealAdd",
          revealCount: 4,
          add: [
            {
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Four Great Dragons"],
                    match: "trait",
                  },
                ],
              },
              orFilters: [{ controllerDefault: "mine", colors: ["Yellow"] }],
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
        { effectTextPart: "Then, place this card in the battle area.", kind: "PlaceInBattleAreaSelf" },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "Place 1 [Trial of the Four Great Dragons] from your hand in the battle area, or you may trash 1 [Four Great Dragons] trait card in your hand.",
          kind: "Modal",
          choose: 1,
          options: [
            [
              {
                kind: "PlaceInBattleAreaSelf",
                target: {
                  filter: {
                    controller: "mine",
                    zone: "hand",
                    kind: ["Option"],
                    nameOrTrait: [
                      {
                        tokens: ["Trial of the Four Great Dragons"],
                        match: "name",
                      },
                    ],
                  },
                  count: 1,
                  from: ["hand"],
                },
                raw: "place 1 [Trial of the Four Great Dragons] from your hand in the battle area",
              },
            ],
            [
              {
                kind: "Trash",
                target: {
                  filter: {
                    controller: "mine",
                    zone: "hand",
                    nameOrTrait: [
                      {
                        tokens: ["Four Great Dragons"],
                        match: "trait",
                      },
                    ],
                  },
                  count: 1,
                },
                raw: "you may trash 1 [Four Great Dragons] trait card in your hand",
              },
            ],
          ],
          optionConditions: [
            {
              kind: "youHave",
              filter: {
                controllerDefault: "mine",
                zone: "hand",
                kind: ["Option"],
                nameOrTrait: [{ tokens: ["Trial of the Four Great Dragons"], match: "name" }],
              },
            },
            {
              kind: "youHave",
              filter: {
                controllerDefault: "mine",
                zone: "hand",
                nameOrTrait: [{ tokens: ["Four Great Dragons"], match: "trait" }],
              },
            },
          ],
          raw: "Place 1 [Trial of the Four Great Dragons] from your hand in the battle area, or you may trash 1 [Four Great Dragons] trait card in your hand.",
        },
        {
          effectTextPart: "If you did either, 1 of your opponent's Digimon gets -7000 DP for the turn.",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: -7000,
          duration: "forTheTurn",
          condition: {
            kind: "ifThisEffectActed",
            raw: "if you did either (placed or trashed), 1 of your opponent's Digimon gets -7000 DP for the turn",
          },
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
          effectTextPart: "[Security] 1 of your opponent's Digimon gets -7000 DP for the turn.",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: -7000,
          duration: "forTheTurn",
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

registerIrCard("BT16-094", compiled);
