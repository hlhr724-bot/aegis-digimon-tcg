import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          condition: {
            kind: "youHave",
            filter: {
              kind: ["Digimon", "Tamer"],
              zone: ["battleArea", "breeding"],
              controllerDefault: "mine",
              nameOrTrait: [{ tokens: ["SW"], match: "trait" }],
            },
            raw: "you have a card w/[SW] trait",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] By trashing 1 [SW] trait card from your hand, ＜Draw 2＞",
          kind: "Draw",
          controller: "mine",
          amount: 2,
          cost: {
            kind: "trash",
            target: {
              filter: {
                controller: "mine",
                zone: "hand",
                nameOrTrait: [{ tokens: ["SW"], match: "trait" }],
              },
              count: 1,
            },
            raw: "By trashing 1 [SW] trait card from your hand",
          },
          optional: true,
          abortOnDecline: true,
        },
        { effectTextPart: "After, place this card in the battle area.", kind: "PlaceInBattleAreaSelf" },
      ],
    },
    {
      trigger: "AllTurns",
      keywords: [{ keyword: "Delay", raw: "＜Delay＞" }],
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
            nameOrTrait: [{ tokens: ["SW"], match: "trait" }],
          },
          actions: [
            {
              kind: "Digivolve",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["SW"], match: "trait" }],
                },
                count: 1,
              },
              into: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [{ tokens: ["Saneiketsu"], match: "trait" }],
              },
              from: ["hand"],
              payCost: false,
              optional: true,
            },
          ],
        },
      ],
    },
    {
      trigger: "Security",
      actions: [{ kind: "ActivateMain" }],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX12-071", compiled);
