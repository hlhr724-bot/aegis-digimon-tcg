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
              zone: "battleArea",
              controllerDefault: "mine",
              kind: ["Tamer"],
              nameOrTrait: [
                {
                  tokens: ["Hunter"],
                  match: "trait",
                },
              ],
            },
            raw: "you have a Tamer with the [Hunter] trait in play",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] By placing up to 2 Digimon cards with ＜Save＞ in their text from under your Tamers or your trash under 1 of your Digimon with ＜Save＞\u00a0in its text as its bottom digivolution cards, that Digimon gains +1000 DP for each card placed by this effect.",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              keywords: ["Save"],
            },
            fromSelectionRef: "P096Recipient",
            count: 1,
          },
          amount: 1000,
          duration: "forTheTurn",
          cost: {
            kind: "place",
            target: {
              filter: {
                controller: "mine",
                kind: ["Digimon"],
                keywords: ["Save"],
              },
              count: 2,
              upTo: true,
              from: ["trash", "underTamers"],
            },
            destination: "digivolutionStack",
            position: "bottom",
            host: "target",
            raw: "By placing up to 2 Digimon cards with ＜Save＞ in their text from under your Tamers or your trash under 1 of your Digimon with ＜Save＞ in its text as its bottom digivolution cards",
            underFilter: {
              controller: "mine",
              kind: ["Digimon"],
              keywords: ["Save"],
            },
            bindHostAs: "P096Recipient",
            trackCount: "P096CardsPlaced",
          },
          optional: true,
          abortOnDecline: true,
          scaling: {
            per: 1,
            unit: "namedCount",
            countSource: "P096CardsPlaced",
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

registerIrCard("P-096", compiled);
