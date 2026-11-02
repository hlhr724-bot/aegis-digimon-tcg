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
            kind: "youHave",
            filter: {
              controllerDefault: "mine",
              kind: ["Digimon", "Tamer"],
              zone: ["battleArea", "breeding"],
              nameOrTrait: [
                {
                  tokens: ["CS"],
                  match: "trait",
                },
              ],
            },
            raw: "you have a Digimon or Tamer with the [CS] trait on the field",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        { effectTextPart: "[Main] ＜Draw 1＞", kind: "Draw", controller: "mine", amount: 1 },
        { effectTextPart: "Then, place this card in the battle area.", kind: "PlaceInBattleAreaSelf" },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "You may play 1 Tamer card with the [CS] trait from your hand without paying the cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Tamer"],
              nameOrTrait: [
                {
                  tokens: ["CS"],
                  match: "trait",
                },
              ],
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
          effectTextPart:
            "[Security] You may play 1 level 3 Digimon card with the [CS] trait from your hand or trash without paying the cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              levels: [3],
              nameOrTrait: [
                {
                  tokens: ["CS"],
                  match: "trait",
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
          kind: "PlaceInBattleAreaSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT23-100", compiled);
