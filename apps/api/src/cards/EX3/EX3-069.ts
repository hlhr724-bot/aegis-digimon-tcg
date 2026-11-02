import type { CompiledCard, SubTriggerEvent } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const endOfOpponentTurn = "endOfOpponentTurn" as unknown as SubTriggerEvent;

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] ＜Draw 1＞.",
          kind: "Draw",
          controller: "mine",
          amount: 1,
        },
        {
          effectTextPart: "Then, place this card in your battle area.",
          kind: "PlaceInBattleAreaSelf",
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "Play 1 Digimon card with [Four Great Dragons] in its traits from your hand without paying the cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Four Great Dragons"],
                  match: "trait",
                },
              ],
            },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
          bindResultAs: "playedByThisEffect",
        },
        {
          effectTextPart:
            "The Digimon played by this effect can't digivolve to level 7, and at the next end of your opponent's turn, delete that Digimon.",
          kind: "Restrict",
          target: {
            filter: {
              boundRef: "playedByThisEffect",
              kind: ["Digimon"],
            },
            count: 1,
          },
          restriction: "digivolveToLevel7",
          duration: "permanent",
        },
        {
          effectTextPart:
            "The Digimon played by this effect can't digivolve to level 7, and at the next end of your opponent's turn, delete that Digimon.",
          kind: "SubTrigger",
          event: endOfOpponentTurn,
          printedClause: "[Pending] At the next end of your opponent's turn, delete that Digimon.",
          once: true,
          on: {
            filter: {
              boundRef: "playedByThisEffect",
            },
            count: 1,
          },
          actions: [
            {
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
          raw: "at the next end of your opponent's turn, delete that Digimon",
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
          kind: "PlaceInBattleAreaSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX3-069", compiled);
