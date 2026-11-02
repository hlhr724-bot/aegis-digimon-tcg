import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Activate 1 of the effects below. If you have a Digimon with [Examon] in its name in play, activate all of the effects below instead.",
          kind: "Modal",
          choose: 1,
          chooseAll: {
            condition: {
              kind: "youHave",
              filter: {
                zone: "battleArea",
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Examon"],
                    match: "name",
                  },
                ],
              },
              raw: "you have a Digimon with [Examon] in its name in play",
            },
          },
          options: [
            [
              {
                effectTextPart:
                  "Suspend 1 of your opponent's Digimon, and 1 of your Digimon gains ＜Piercing＞ for the turn.",
                kind: "Suspend",
                target: {
                  filter: {
                    controller: "opponent",
                    kind: ["Digimon"],
                  },
                  count: 1,
                },
              },
              {
                effectTextPart:
                  "Suspend 1 of your opponent's Digimon, and 1 of your Digimon gains ＜Piercing＞ for the turn.",
                kind: "GainKeyword",
                target: {
                  filter: {
                    controllerDefault: "mine",
                    kind: ["Digimon"],
                  },
                  count: 1,
                },
                keyword: {
                  keyword: "Piercing",
                  raw: "＜Piercing＞",
                },
                duration: "forTheTurn",
              },
            ],
            [
              {
                effectTextPart: "Unsuspend 1 of your Digimon.",
                kind: "Unsuspend",
                target: {
                  filter: {
                    controller: "mine",
                    kind: ["Digimon"],
                  },
                  count: 1,
                },
              },
            ],
          ],
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "Suspend",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
        },
        {
          kind: "Unsuspend",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 1,
          },
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX3-070", compiled);
