import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        {
          keyword: "Blocker",
          raw: "＜Blocker＞",
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Sistermon"],
                  match: "name",
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
          effectTextPart: "All of your Digimon get +2000 DP.",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: "all",
          },
          playerWide: true,
          amount: 2000,
          duration: "untilOpponentTurnEnd",
          condition: {
            kind: "anyOf",
            conditions: [
              {
                kind: "selfDigivolutionStackHasTrait",
                filter: {
                  nameOrTrait: [
                    {
                      tokens: ["Gankoomon"],
                      match: "nameExact",
                    },
                  ],
                },
                raw: "[Gankoomon] is in this Digimon's digivolution cards",
              },
              {
                kind: "youHave",
                filter: {
                  zone: "battleArea",
                  controllerDefault: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [
                    {
                      tokens: ["Sistermon"],
                      match: "name",
                    },
                  ],
                },
                raw: "you have a Digimon with [Sistermon] in its name in play",
              },
            ],
            raw: "[Gankoomon] is in this Digimon's digivolution cards or you have a Digimon with [Sistermon] in its name in play",
          },
        },
        {
          kind: "GrantStatic",
          effectTextPart:
            "Your opponent's effects can't return any of your Digimon to hands or decks or reduce their DP.",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: "all",
          },
          playerWide: true,
          grant: "immuneToOpponentDPReductionAndReturn",
          tokens: [],
          duration: "untilOpponentTurnEnd",
          condition: {
            kind: "anyOf",
            conditions: [
              {
                kind: "selfDigivolutionStackHasTrait",
                filter: {
                  nameOrTrait: [
                    {
                      tokens: ["Gankoomon"],
                      match: "nameExact",
                    },
                  ],
                },
                raw: "[Gankoomon] is in this Digimon's digivolution cards",
              },
              {
                kind: "youHave",
                filter: {
                  zone: "battleArea",
                  controllerDefault: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [
                    {
                      tokens: ["Sistermon"],
                      match: "name",
                    },
                  ],
                },
                raw: "you have a Digimon with [Sistermon] in its name in play",
              },
            ],
            raw: "[Gankoomon] is in this Digimon's digivolution cards or you have a Digimon with [Sistermon] in its name in play",
          },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      names: ["Gankoomon"],
      cost: 1,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT10-068", compiled);
