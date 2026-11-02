import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "CostModifier",
          costType: "play",
          handResident: true,
          mode: "set",
          amount: 0,
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          duration: "permanent",
          condition: {
            kind: "allOf",
            conditions: [
              {
                kind: "youHave",
                filter: {
                  controller: "any",
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["Agumon"], match: "nameExact" }],
                },
                raw: "you have [Agumon]",
              },
              {
                kind: "youHave",
                filter: {
                  controller: "any",
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["Pulsemon"], match: "nameExact" }],
                },
                raw: "you have [Pulsemon]",
              },
              {
                kind: "youHave",
                filter: {
                  controller: "any",
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["Gammamon"], match: "nameExact" }],
                },
                raw: "you have [Gammamon]",
              },
            ],
            raw: "you have [Agumon], [Pulsemon], and [Gammamon]",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Reveal the top 2 cards of your deck. Add all Tamer cards with a play cost of 3 or less among them to your hand. Return the rest to the top of the deck.",
          kind: "RevealAdd",
          revealCount: 2,
          add: [
            {
              filter: {
                controllerDefault: "mine",
                kind: ["Tamer"],
                playCostLte: 3,
              },
              count: "all",
              to: "hand",
            },
          ],
          rest: "deckTop",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "ActivateMain",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("P-116", compiled);
