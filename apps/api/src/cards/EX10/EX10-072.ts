import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
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
            kind: "youHaveNone",
            filter: {
              zone: "battleArea",
              controllerDefault: "mine",
              nameOrTrait: [
                {
                  tokens: ["Spiral Mountain"],
                  match: "name",
                },
              ],
            },
            raw: "you don't have [Spiral Mountain] in the battle area",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] ＜Draw 2＞",
          kind: "Draw",
          controller: "mine",
          amount: 2,
        },
        {
          kind: "PlaceInBattleAreaSelf",
        },
      ],
    },
    {
      trigger: "EndOfOpponentsTurn",
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Dark Masters"],
                  match: "trait",
                },
              ],
              faceUp: true,
            },
            count: 1,
          },
          from: ["security"],
          payCost: false,
          optional: true,
        },
        {
          kind: "DelayedDeletePlayed",
          raw: "at the end of your turn, delete the Digimon this effect played",
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
          effectTextPart:
            "[Security] You may play 1 Digimon card with the [Dark Masters] trait from your hand or trash without paying the cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Dark Masters"],
                  match: "trait",
                },
              ],
            },
            count: 1,
          },
          from: ["hand", "trash"],
          payCost: false,
          optional: true,
          bindResultAs: "playedByThisEffect",
        },
        {
          kind: "AddToHandSelf",
        },
        {
          kind: "SubTrigger",
          event: "endOfTurn",
          printedClause: "[Pending] At turn end, delete the Digimon this effect played.",
          on: {
            filter: {
              boundRef: "playedByThisEffect",
            },
            count: 1,
          },
          actions: [
            {
              effectTextPart: "Then, add this card to the hand. At turn end, delete the Digimon this effect played.",
              kind: "Delete",
              target: {
                filter: {
                  isSelfRef: true,
                },
                count: 1,
                isSelf: true,
              },
            },
          ],
          raw: "at turn end, delete the Digimon this effect played",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX10-072", compiled);
