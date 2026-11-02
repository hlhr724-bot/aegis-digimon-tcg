import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 green Digimon card",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                colors: ["Green"],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 such Tamer card among them to the hand.",
              filter: {
                controllerDefault: "mine",
                kind: ["Tamer"],
                colors: ["Green"],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
        {
          kind: "PlaceInBattleAreaSelf",
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "You may play 1 [Terriermon] or [Lopmon] from your hand without paying the cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Terriermon", "Lopmon"], match: "nameExact" }],
            },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
          optional: true,
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
          effectTextPart: "[Security] Suspend 2 of your opponent's Digimon.",
          kind: "Suspend",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 2,
          },
        },
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

registerIrCard("ST17-11", compiled);
