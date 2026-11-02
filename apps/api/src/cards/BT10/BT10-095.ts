import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Activate 1 of the effects below.",
          kind: "Modal",
          choose: 1,
          options: [
            [
              {
                effectTextPart:
                  "1 of your Digimon with [Xros Heart] in its traits gains ＜Security Attack +1＞ for the turn.",
                kind: "GainKeyword",
                target: {
                  filter: {
                    controller: "mine",
                    kind: ["Digimon"],
                    nameOrTrait: [
                      {
                        tokens: ["Xros Heart"],
                        match: "trait",
                      },
                    ],
                  },
                  count: 1,
                },
                keyword: {
                  keyword: "SecurityAttack",
                  amount: 1,
                  raw: "＜Security Attack +1＞",
                },
                duration: "forTheTurn",
              },
            ],
            [
              {
                effectTextPart: "＜Draw 2＞ (Draw 2 cards from your deck.)",
                kind: "Draw",
                controller: "mine",
                amount: 2,
              },
            ],
          ],
          optional: false,
          condition: {
            kind: "not",
            condition: {
              kind: "youHave",
              filter: {
                controller: "mine",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Shoutmon X5"],
                    match: "name",
                  },
                ],
              },
            },
          },
        },
        {
          effectTextPart:
            "1 of your Digimon with [Xros Heart] in its traits gains ＜Security Attack +1＞ for the turn.",
          kind: "GainKeyword",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Xros Heart"],
                  match: "trait",
                },
              ],
            },
            count: 1,
          },
          keyword: {
            keyword: "SecurityAttack",
            amount: 1,
            raw: "＜Security Attack +1＞",
          },
          duration: "forTheTurn",
          optional: false,
          condition: {
            kind: "youHave",
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Shoutmon X5"],
                  match: "name",
                },
              ],
            },
          },
        },
        {
          effectTextPart: "＜Draw 2＞ (Draw 2 cards from your deck.)",
          kind: "Draw",
          controller: "mine",
          amount: 2,
          optional: false,
          condition: {
            kind: "youHave",
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Shoutmon X5"],
                  match: "name",
                },
              ],
            },
          },
        },
      ],
    },
    {
      trigger: "Security",
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

registerIrCard("BT10-095", compiled);
