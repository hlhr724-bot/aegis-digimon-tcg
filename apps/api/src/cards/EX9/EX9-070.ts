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
                  tokens: ["DM"],
                  match: "trait",
                },
              ],
            },
            raw: "while you have a [DM] trait Digimon or Tamer on the field (battle area or breeding area)",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        { effectTextPart: "[Main] ＜Draw 1＞.", kind: "Draw", controller: "mine", amount: 1 },
        { effectTextPart: "Then, place this card in the battle area.", kind: "PlaceInBattleAreaSelf" },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "By placing 1 card from your hand face down as any of your [DM] trait Digimon's bottom digivolution card, it may digivolve into a [DM] trait Digimon card in the hand with the digivolution cost reduced by 2.",
          payCostBeforeOptional: false,
          kind: "Digivolve",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["DM"],
                  match: "trait",
                },
              ],
            },
            count: 1,
            isSelf: false,
            fromSelectionRef: "paidHost",
          },
          into: {
            controllerDefault: "mine",
            kind: ["Digimon"],
            nameOrTrait: [
              {
                tokens: ["DM"],
                match: "trait",
              },
            ],
            zone: "hand",
          },
          from: ["hand"],
          reduceCost: 2,
          payCost: true,
          optional: true,
          cost: {
            kind: "place",
            optional: true,
            target: {
              filter: {
                controller: "mine",
                zone: "hand",
              },
              count: 1,
              from: ["hand"],
            },
            host: "target",
            underFilter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["DM"],
                  match: "trait",
                },
              ],
            },
            bindHostAs: "paidHost",
            raw: "By placing 1 card from your hand face down as any of your [DM] trait Digimon's bottom digivolution card",
            destination: "digivolutionStack",
            position: "bottom",
            faceDown: true,
          },
          abortOnDecline: true,
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
          effectTextPart: "[Security] ＜Draw 1＞.",
          kind: "Draw",
          controller: "mine",
          amount: 1,
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

registerIrCard("EX9-070", compiled);
