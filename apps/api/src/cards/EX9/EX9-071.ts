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
            kind: "anyOf",
            conditions: [
              {
                kind: "youHave",
                filter: {
                  controllerDefault: "mine",
                  zone: "battleArea",
                  kind: ["Digimon", "Tamer"],
                  nameOrTrait: [{ tokens: ["DM"], match: "trait" }],
                },
              },
              {
                kind: "youHave",
                filter: {
                  controllerDefault: "mine",
                  zone: "breeding",
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["DM"], match: "trait" }],
                },
              },
            ],
            raw: "you have a [DM] trait Digimon or Tamer on the field",
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
            "By trashing 1 of your [DM]\u00a0trait Digimon's bottom 2 face-down digivolution card, it unsuspends.",
          kind: "Unsuspend",
          target: {
            filter: {},
            count: 1,
            fromSelectionRef: "paidHost",
          },
          cost: {
            kind: "trash",
            target: {
              filter: {
                controller: "mine",
                zone: "digivolutionCards",
                faceDown: true,
                withinBottomN: 2,
                sameHost: true,
                hostFilter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [
                    {
                      tokens: ["DM"],
                      match: "trait",
                    },
                  ],
                },
              },
              count: 2,
            },
            bindHostAs: "paidHost",
            raw: "By trashing 1 of your [DM] trait Digimon's bottom 2 face-down digivolution cards",
          },
          optional: true,
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
          effectTextPart: "[Security] Gain 1 memory.",
          kind: "GainMemory",
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

registerIrCard("EX9-071", compiled);
