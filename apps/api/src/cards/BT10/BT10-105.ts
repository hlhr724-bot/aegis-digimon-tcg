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
              kind: ["Tamer"],
            },
            raw: "you have a Tamer in play",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Until the end of your opponent's turn, 1 of your Digimon gains ＜Blocker＞ (When an opponent's Digimon attacks, you may suspend this Digimon to force the opponent to attack it instead), and ＜Reboot＞ (Unsuspend this Digimon during your opponent's unsuspend phase), and can't be deleted by your opponent's effects.",
          kind: "SelectBind",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 1,
            bindAs: "protectedDigimon",
          },
        },
        {
          effectTextPart:
            "[Main] Until the end of your opponent's turn, 1 of your Digimon gains ＜Blocker＞ (When an opponent's Digimon attacks, you may suspend this Digimon to force the opponent to attack it instead), and ＜Reboot＞ (Unsuspend this Digimon during your opponent's unsuspend phase), and can't be deleted by your opponent's effects.",
          kind: "GainKeyword",
          target: {
            fromSelectionRef: "protectedDigimon",
            filter: {},
            count: 1,
          },
          keyword: {
            keyword: "Blocker",
            raw: "＜Blocker＞",
          },
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] Until the end of your opponent's turn, 1 of your Digimon gains ＜Blocker＞ (When an opponent's Digimon attacks, you may suspend this Digimon to force the opponent to attack it instead), and ＜Reboot＞ (Unsuspend this Digimon during your opponent's unsuspend phase), and can't be deleted by your opponent's effects.",
          kind: "Restrict",
          target: {
            fromSelectionRef: "protectedDigimon",
            filter: {},
            count: 1,
          },
          restriction: "beDeleted",
          byOpponentEffectsOnly: true,
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] Until the end of your opponent's turn, 1 of your Digimon gains ＜Blocker＞ (When an opponent's Digimon attacks, you may suspend this Digimon to force the opponent to attack it instead), and ＜Reboot＞ (Unsuspend this Digimon during your opponent's unsuspend phase), and can't be deleted by your opponent's effects.",
          kind: "GainKeyword",
          target: {
            fromSelectionRef: "protectedDigimon",
            filter: {},
            count: 1,
          },
          keyword: {
            keyword: "Reboot",
            raw: "＜Reboot＞",
          },
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          effectTextPart:
            "[Security] Reveal the top 3 cards of your deck. You may play 1 Digimon card with a play cost of 4 or less among them without paying its memory cost. Place the rest at the bottom of your deck in any order.",
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                playCostLte: 4,
              },
              count: 1,
              to: "play",
              optional: true,
            },
          ],
          rest: "deckBottom",
        },
        {
          effectTextPart: "Then, add this card to its owner's hand.",
          kind: "AddToHandSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT10-105", compiled);
