import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
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
              kind: ["Tamer"],
              nameOrTrait: [
                {
                  tokens: ["Tai Kamiya"],
                  match: "name",
                },
              ],
            },
            raw: "you have a Tamer with [Tai Kamiya] in its name",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] By placing 1 [Greymon] and 1 [MetalGreymon] from your trash as 1 of your [Agumon]'s bottom digivolution cards, that Digimon may digivolve into [WarGreymon] in your hand without paying the cost, ignoring its digivolution requirements.",
          kind: "CostGatedBlock",
          cost: {
            kind: "compound",
            orderPlacedCards: true,
            costs: [
              {
                kind: "place",
                target: {
                  filter: {
                    zone: "trash",
                    controller: "mine",
                    nameOrTrait: [
                      {
                        tokens: ["Greymon"],
                        match: "nameExact",
                      },
                    ],
                  },
                  count: 1,
                  from: ["trash"],
                },
                raw: "By placing 1 [Greymon] and 1 [MetalGreymon] from your trash as 1 of your [Agumon]'s bottom digivolution cards",
                underFilter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [
                    {
                      tokens: ["Agumon"],
                      match: "nameExact",
                    },
                  ],
                },
                destination: "digivolutionStack",
                position: "bottom",
                host: "target",
                bindHostAs: "bt14090Agumon",
              },
              {
                kind: "place",
                target: {
                  filter: {
                    zone: "trash",
                    controller: "mine",
                    nameOrTrait: [
                      {
                        tokens: ["MetalGreymon"],
                        match: "nameExact",
                      },
                    ],
                  },
                  count: 1,
                  from: ["trash"],
                },
                underFilter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [
                    {
                      tokens: ["Agumon"],
                      match: "nameExact",
                    },
                  ],
                },
                destination: "digivolutionStack",
                position: "bottom",
                host: { filter: { boundRef: "bt14090Agumon" }, count: 1 },
              },
            ],
          },
          actions: [
            {
              kind: "Digivolve",
              target: {
                filter: {
                  controllerDefault: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [
                    {
                      tokens: ["Agumon"],
                      match: "nameExact",
                    },
                  ],
                },
                count: 1,
                fromSelectionRef: "bt14090Agumon",
              },
              into: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["WarGreymon"],
                    match: "nameExact",
                  },
                ],
              },
              payCost: false,
              from: ["hand"],
              ignoreRequirements: true,
              optional: true,
            },
          ],
          optional: true,
          abortOnDecline: true,
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          effectTextPart: "[Security] You may play 1 [Agumon] from your hand or trash without paying the cost.",
          kind: "PlayWithoutCost",
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

export { compiled };
registerIrCard("BT14-090", compiled);
