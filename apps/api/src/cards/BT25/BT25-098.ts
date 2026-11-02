import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      keywords: [],
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          condition: {
            kind: "youHave",
            filter: {
              controllerDefault: "mine",
              zone: ["battleArea", "breeding"],
              kind: ["Digimon", "Tamer"],
              nameOrTrait: [{ tokens: ["Appmon"], match: "trait" }],
            },
            raw: "you have a card w/[Appmon] trait",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Reveal the top 3 cards of your deck. Add 1 [Appmon] trait card among them to the hand. Trash the rest.",
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              filter: {
                nameOrTrait: [{ tokens: ["Appmon"], match: "trait" }],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "trash",
        },
        { effectTextPart: "Then, place this card in the battle area.", kind: "PlaceInBattleAreaSelf" },
      ],
    },
    {
      trigger: "Main",
      keywords: [{ keyword: "Delay" }],
      actions: [
        {
          effectTextPart: "You may play 1 [Appmon] trait card from your hand with the cost reduced by 3.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              nameOrTrait: [{ tokens: ["Appmon"], match: "trait" }],
            },
            count: 1,
            upTo: true,
          },
          payCost: true,
          reduceCostBy: 3,
          from: ["hand"],
          optional: true,
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      keywords: [],
      actions: [
        {
          kind: "PlaceInBattleAreaSelf",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT25-098", compiled);
