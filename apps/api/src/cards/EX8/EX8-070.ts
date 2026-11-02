import type { CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Security",
      actions: [
        {
          kind: "Delete",
          target: {
            filter: { controllerDefault: "opponent", kind: ["Digimon"], superlative: "lowestPlayCost" },
            count: 1,
          },
        },
      ],
      isSecurity: true,
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] By trashing any 1 digivolution card of 1 of your Digimon with the [Mineral]/[Rock]\u00a0trait, until the end of your opponent's turn, that Digimon gains ＜Collision＞ , ＜Piercing＞ , ＜Reboot＞ , and your opponent's effects can't return it to hands or decks, and it gets +3000 DP.",
          kind: "SelectBind",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Mineral", "Rock"],
                  match: "trait",
                },
              ],
              digivolutionCards: "hasAny",
            },
            count: 1,
            bindAs: "thatDigimon",
          },
          cost: {
            kind: "trash",
            target: {
              filter: { zone: "digivolutionCards", boundTo: "thatDigimon" } as Filter & { boundTo: string },
              count: 1,
            },
            raw: "By trashing any 1 digivolution card of 1 of your Digimon with the [Mineral]/[Rock] trait",
          },
          optional: true,
          abortOnDecline: true,
        },
        {
          effectTextPart:
            "[Main] By trashing any 1 digivolution card of 1 of your Digimon with the [Mineral]/[Rock]\u00a0trait, until the end of your opponent's turn, that Digimon gains ＜Collision＞ , ＜Piercing＞ , ＜Reboot＞ , and your opponent's effects can't return it to hands or decks, and it gets +3000 DP.",
          kind: "GainKeyword",
          target: {
            fromSelectionRef: "thatDigimon",
            filter: {},
            count: 1,
          },
          keyword: {
            keyword: "Collision",
            raw: "＜Collision＞",
          },
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] By trashing any 1 digivolution card of 1 of your Digimon with the [Mineral]/[Rock]\u00a0trait, until the end of your opponent's turn, that Digimon gains ＜Collision＞ , ＜Piercing＞ , ＜Reboot＞ , and your opponent's effects can't return it to hands or decks, and it gets +3000 DP.",
          kind: "GainKeyword",
          target: {
            fromSelectionRef: "thatDigimon",
            filter: {},
            count: 1,
          },
          keyword: {
            keyword: "Piercing",
            raw: "＜Piercing＞",
          },
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] By trashing any 1 digivolution card of 1 of your Digimon with the [Mineral]/[Rock]\u00a0trait, until the end of your opponent's turn, that Digimon gains ＜Collision＞ , ＜Piercing＞ , ＜Reboot＞ , and your opponent's effects can't return it to hands or decks, and it gets +3000 DP.",
          kind: "GainKeyword",
          target: {
            fromSelectionRef: "thatDigimon",
            filter: {},
            count: 1,
          },
          keyword: {
            keyword: "Reboot",
            raw: "＜Reboot＞",
          },
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] By trashing any 1 digivolution card of 1 of your Digimon with the [Mineral]/[Rock]\u00a0trait, until the end of your opponent's turn, that Digimon gains ＜Collision＞ , ＜Piercing＞ , ＜Reboot＞ , and your opponent's effects can't return it to hands or decks, and it gets +3000 DP.",
          kind: "Restrict",
          target: {
            fromSelectionRef: "thatDigimon",
            filter: {},
            count: 1,
          },
          restriction: "cannotReturnToHandOrDeck",
          byOpponentEffectsOnly: true,
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] By trashing any 1 digivolution card of 1 of your Digimon with the [Mineral]/[Rock]\u00a0trait, until the end of your opponent's turn, that Digimon gains ＜Collision＞ , ＜Piercing＞ , ＜Reboot＞ , and your opponent's effects can't return it to hands or decks, and it gets +3000 DP.",
          kind: "ModifyDP",
          target: {
            fromSelectionRef: "thatDigimon",
            filter: {},
            count: 1,
          },
          amount: 3000,
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX8-070", compiled);
