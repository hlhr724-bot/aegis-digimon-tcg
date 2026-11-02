import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] By trashing 1 card in your hand, delete 1 of your opponent's level 6 or lower Digimon.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              levelComparison: {
                op: "lte",
                value: 6,
              },
            },
            count: 1,
          },
          cost: {
            kind: "trash",
            target: {
              filter: {
                zone: "hand",
                controller: "mine",
              },
              count: 1,
            },
            bindResultAs: "trashedCard",
            raw: "By trashing 1 card in your hand",
          },
          optional: true,
          abortOnDecline: true,
        },
        {
          effectTextPart:
            "If this effect trashed a card with the [Seven Great Demon Lords]\u00a0trait, place this card in the battle area.",
          kind: "PlaceInBattleAreaSelf",
          condition: {
            kind: "bindingContains",
            ref: "trashedCard",
            filter: {
              nameOrTrait: [{ tokens: ["Seven Great Demon Lords"], match: "trait" }],
            },
            raw: "the card trashed from your hand has the [Seven Great Demon Lords] trait",
          },
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          raw: "When an effect plays an opponent's Digimon, this Digimon gains ＜Delay＞.",
          sourceFilter: {
            controller: "opponent",
            kind: ["Digimon"],
            zone: "battleArea",
            byEffect: true,
          },
          actions: [
            {
              kind: "GainKeyword",
              target: {
                filter: {
                  isSelfRef: true,
                },
                count: 1,
                isSelf: true,
              },
              keyword: {
                keyword: "Delay",
                raw: "＜Delay＞",
              },
              duration: "permanent",
            },
          ],
        },
      ],
    },
    {
      trigger: "Main",
      keywords: [
        {
          keyword: "Delay",
          raw: "＜Delay＞",
        },
      ],
      actions: [
        {
          kind: "PlayWithoutCost",
          requiresDelayArmed: true,
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Leviamon"],
                  match: "nameExact",
                },
              ],
            },
            count: 1,
          },
          from: ["trash"],
          payCost: false,
          optional: true,
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

registerIrCard("EX5-069", compiled);
