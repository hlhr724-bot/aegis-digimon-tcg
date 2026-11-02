import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      condition: {
        kind: "allOf",
        conditions: [
          {
            kind: "youHave",
            filter: {
              zone: "battleArea",
              controllerDefault: "mine",
              kind: ["Tamer"],
              nameOrTrait: [{ tokens: ["Davis Motomiya"], match: "nameExact" }],
            },
            raw: "you have [Davis Motomiya] in play",
          },
          {
            kind: "youHave",
            filter: {
              zone: "battleArea",
              controllerDefault: "mine",
              kind: ["Tamer"],
              nameOrTrait: [{ tokens: ["Ken Ichijoji"], match: "nameExact" }],
            },
            raw: "you have [Ken Ichijoji] in play",
          },
        ],
      },
      actions: [
        {
          effectTextPart:
            "[Main] If you have [Davis Motomiya] and [Ken Ichijoji] in play, you may place 1 [ExVeemon] and 1 [Stingmon] from your hand at the bottom of your deck in any order to play 1 [Paildramon] from your hand without paying its memory cost.",
          payCostBeforeOptional: false,
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Paildramon"], match: "nameExact" }],
            },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
          cost: {
            kind: "return",
            target: {
              filter: {
                zone: "hand",
                controller: "mine",
                kind: ["Digimon"],
              },
              count: 2,
              requiredNamesExact: ["ExVeemon", "Stingmon"],
            },
            to: "deckBottom",
            orderReturnedCards: true,
            raw: "by placing 1 [ExVeemon] and 1 [Stingmon] from your hand at the bottom of your deck in any order",
          },
          optional: true,
        },
      ],
    },
    {
      trigger: "Security",
      actions: [{ kind: "AddToHandSelf" }],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("P-022", compiled);
