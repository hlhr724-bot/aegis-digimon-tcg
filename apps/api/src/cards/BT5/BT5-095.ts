import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Delete 1 of your opponent's Digimon with 11000 DP or less. If you have a Digimon in play with [Omnimon] or [Greymon] (other than [DoruGreymon], [BurningGreymon], or [DexDoruGreymon]) in its name, delete 1 of your opponent's Digimon with 15000 DP or less instead.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              dp: {
                op: "lte",
                value: 11000,
              },
            },
            count: 1,
          },
          condition: {
            kind: "youHaveNone",
            filter: {
              excludeNameOrTrait: [
                { tokens: ["DoruGreymon"], match: "nameExact" },
                { tokens: ["BurningGreymon"], match: "nameExact" },
                { tokens: ["DexDoruGreymon"], match: "nameExact" },
              ],
              zone: "battleArea",
              controllerDefault: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Omnimon", "Greymon"],
                  match: "name",
                },
              ],
            },
            raw: "you don't have a qualifying [Omnimon] or [Greymon] Digimon in play",
          },
        },
        {
          effectTextPart:
            "[Main] Delete 1 of your opponent's Digimon with 11000 DP or less. If you have a Digimon in play with [Omnimon] or [Greymon] (other than [DoruGreymon], [BurningGreymon], or [DexDoruGreymon]) in its name, delete 1 of your opponent's Digimon with 15000 DP or less instead.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              dp: {
                op: "lte",
                value: 15000,
              },
            },
            count: 1,
          },
          condition: {
            kind: "youHave",
            filter: {
              excludeNameOrTrait: [
                { tokens: ["DoruGreymon"], match: "nameExact" },
                { tokens: ["BurningGreymon"], match: "nameExact" },
                { tokens: ["DexDoruGreymon"], match: "nameExact" },
              ],
              zone: "battleArea",
              controllerDefault: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Omnimon", "Greymon"],
                  match: "name",
                },
              ],
            },
            raw: "you have a Digimon in play with [Omnimon] or [Greymon] other than [DoruGreymon], [BurningGreymon], or [DexDoruGreymon] in its name",
          },
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

registerIrCard("BT5-095", compiled);
