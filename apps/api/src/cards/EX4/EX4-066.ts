import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Activate 1 of the effects below.",
          kind: "Modal",
          choose: 1,
          labels: [
            "Digivolve 1 of your [Agumon] or [Greymon] into [BlitzGreymon] in your hand",
            "Digivolve 1 of your [Gabumon] or [Garurumon] into [CresGarurumon] in your hand",
          ],
          options: [
            [
              {
                effectTextPart:
                  "If you have [CresGarurumon] in play, 1 of your [Agumon] or [Greymon] may digivolve into [BlitzGreymon] in your hand, ignoring digivolution requirements and without paying the cost.",
                kind: "Digivolve",
                target: {
                  filter: {
                    controller: "mine",
                    nameOrTrait: [
                      {
                        tokens: ["Agumon", "Greymon"],
                        match: "nameExact",
                      },
                    ],
                  },
                  count: 1,
                },
                into: {
                  controllerDefault: "mine",
                  nameOrTrait: [
                    {
                      tokens: ["BlitzGreymon"],
                      match: "nameExact",
                    },
                  ],
                },
                payCost: false,
                from: ["hand"],
                ignoreRequirements: true,
                optional: true,
                condition: {
                  kind: "youHave",
                  filter: {
                    zone: "battleArea",
                    controllerDefault: "mine",
                    nameOrTrait: [
                      {
                        tokens: ["CresGarurumon"],
                        match: "nameExact",
                      },
                    ],
                  },
                  raw: "you have [CresGarurumon] in play",
                },
              },
            ],
            [
              {
                effectTextPart:
                  "If you have [BlitzGreymon] in play, 1 of your [Gabumon] or [Garurumon] may digivolve into [CresGarurumon] in your hand, ignoring digivolution requirements and without paying the cost.",
                kind: "Digivolve",
                target: {
                  filter: {
                    controller: "mine",
                    nameOrTrait: [
                      {
                        tokens: ["Gabumon", "Garurumon"],
                        match: "nameExact",
                      },
                    ],
                  },
                  count: 1,
                },
                into: {
                  controllerDefault: "mine",
                  nameOrTrait: [
                    {
                      tokens: ["CresGarurumon"],
                      match: "nameExact",
                    },
                  ],
                },
                payCost: false,
                from: ["hand"],
                ignoreRequirements: true,
                optional: true,
                condition: {
                  kind: "youHave",
                  filter: {
                    zone: "battleArea",
                    controllerDefault: "mine",
                    nameOrTrait: [
                      {
                        tokens: ["BlitzGreymon"],
                        match: "nameExact",
                      },
                    ],
                  },
                  raw: "you have [BlitzGreymon] in play",
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
          effectTextPart:
            "[Security] You may play 1 [Gabumon] or [Agumon] from your hand or trash without paying the cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              nameOrTrait: [
                {
                  tokens: ["Gabumon", "Agumon"],
                  match: "nameExact",
                },
              ],
            },
            count: 1,
          },
          from: ["hand", "trash"],
          payCost: false,
          optional: true,
        },
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

registerIrCard("EX4-066", compiled);
