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
                  tokens: ["Matt Ishida"],
                  match: "name",
                },
              ],
            },
            raw: "you have a Tamer with [Matt Ishida] in its name",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] By placing 1 [Garurumon] and 1 [WereGarurumon] from your trash as 1 of your [Gabumon]'s bottom digivolution cards, that Digimon may digivolve into [MetalGarurumon] in your hand, ignoring its digivolution requirements and without paying the cost.",
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
                        tokens: ["Garurumon"],
                        match: "nameExact",
                      },
                    ],
                  },
                  count: 1,
                  from: ["trash"],
                },
                raw: "By placing 1 [Garurumon] and 1 [WereGarurumon] from your trash as 1 of your [Gabumon]'s bottom digivolution cards",
                underFilter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [
                    {
                      tokens: ["Gabumon"],
                      match: "nameExact",
                    },
                  ],
                },
                destination: "digivolutionStack",
                position: "bottom",
                host: "target",
                bindHostAs: "bt15091Gabumon",
              },
              {
                kind: "place",
                target: {
                  filter: {
                    zone: "trash",
                    controller: "mine",
                    nameOrTrait: [
                      {
                        tokens: ["WereGarurumon"],
                        match: "nameExact",
                      },
                    ],
                  },
                  count: 1,
                  from: ["trash"],
                },
                destination: "digivolutionStack",
                position: "bottom",
                host: { filter: { boundRef: "bt15091Gabumon" }, count: 1 },
              },
            ],
          },
          optional: true,
          abortOnDecline: true,
          actions: [
            {
              kind: "Digivolve",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [
                    {
                      tokens: ["Gabumon"],
                      match: "nameExact",
                    },
                  ],
                },
                count: 1,
                fromSelectionRef: "bt15091Gabumon",
              },
              into: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["MetalGarurumon"],
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
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          effectTextPart: "You may play 1 [Gabumon] from your hand or trash without paying the cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              nameOrTrait: [
                {
                  tokens: ["Gabumon"],
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
          effectTextPart: "Then, add this card to the hand.",
          kind: "AddToHandSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT15-091", compiled);
export { compiled };
