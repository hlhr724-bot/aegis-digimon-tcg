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
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Armor Form"],
                  match: "trait",
                },
              ],
            },
            raw: "you have a Digimon with [Armor Form] in its traits in play",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] 1 of your Digimon with 2 or more colors gets +2000 DP and ＜Piercing＞ for the turn. (When this Digimon attacks and deletes an opponent's Digimon and survives the battle, it performs any security checks it normally would.)",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              multicolor: true,
            },
            count: 1,
          },
          amount: 2000,
          duration: "forTheTurn",
        },
        {
          effectTextPart:
            "[Main] 1 of your Digimon with 2 or more colors gets +2000 DP and ＜Piercing＞ for the turn. (When this Digimon attacks and deletes an opponent's Digimon and survives the battle, it performs any security checks it normally would.)",
          kind: "GainKeyword",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              multicolor: true,
            },
            count: 1,
            sameTarget: true,
          },
          keyword: {
            keyword: "Piercing",
            raw: "＜Piercing＞",
          },
          duration: "forTheTurn",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "Suspend",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT8-103", compiled);
