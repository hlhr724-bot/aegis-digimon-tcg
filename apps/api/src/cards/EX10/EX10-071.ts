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
              kind: ["Digimon"],
              zone: ["battleArea", "breeding"],
              nameOrTrait: [
                {
                  tokens: ["Lucemon"],
                  match: "name",
                },
              ],
            },
            raw: "you have a Digimon with [Lucemon] in its name in its name on the field",
          },
        },
      ],
    },
    {
      trigger: "EndOfYourTurn",
      condition: {
        kind: "youHave",
        filter: {
          controllerDefault: "mine",
          kind: ["Digimon"],
          nameOrTrait: [{ tokens: ["Lucemon"], match: "name" }],
        },
        raw: "you have a Digimon with [Lucemon] in its name in its name",
      },
      actions: [
        {
          kind: "trashSecurityTop",
          controller: "mine",
          count: 1,
          condition: {
            kind: "youHave",
            filter: {
              controllerDefault: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Lucemon"], match: "name" }],
            },
            raw: "you have a Digimon with [Lucemon] in its name in its name",
          },
          cost: {
            kind: "return",
            target: {
              filter: { isSelfRef: true, zone: "trash", controller: "mine" },
              count: 1,
              isSelf: true,
              from: ["trash"],
            },
            to: "deckBottom",
            raw: "by returning this card to the bottom of the deck",
          },
          optional: true,
          abortOnDecline: true,
        },
        {
          kind: "Attack",
          target: {
            filter: { controller: "mine", kind: ["Digimon"] },
            count: 1,
          },
          withoutSuspending: true,
        },
      ],
      isFromTrash: true,
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Until your opponent's turn ends, 1 of your Digimon with [Lucemon]\u00a0in its name gains ＜Raid＞ , ＜Piercing＞ , ＜Blocker＞ and +3000 DP.",
          kind: "GainKeyword",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Lucemon"],
                  match: "name",
                },
              ],
            },
            count: 1,
            bindAs: "lucemonBuffTarget",
          },
          keyword: {
            keyword: "Raid",
            raw: "＜Raid＞",
          },
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] Until your opponent's turn ends, 1 of your Digimon with [Lucemon]\u00a0in its name gains ＜Raid＞ , ＜Piercing＞ , ＜Blocker＞ and +3000 DP.",
          kind: "GainKeyword",
          target: {
            filter: {},
            count: 1,
            fromSelectionRef: "lucemonBuffTarget",
          },
          keyword: {
            keyword: "Piercing",
            raw: "＜Piercing＞",
          },
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] Until your opponent's turn ends, 1 of your Digimon with [Lucemon]\u00a0in its name gains ＜Raid＞ , ＜Piercing＞ , ＜Blocker＞ and +3000 DP.",
          kind: "GainKeyword",
          target: {
            filter: {},
            count: 1,
            fromSelectionRef: "lucemonBuffTarget",
          },
          keyword: {
            keyword: "Blocker",
            raw: "＜Blocker＞",
          },
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] Until your opponent's turn ends, 1 of your Digimon with [Lucemon]\u00a0in its name gains ＜Raid＞ , ＜Piercing＞ , ＜Blocker＞ and +3000 DP.",
          kind: "ModifyDP",
          target: {
            filter: {},
            count: 1,
            fromSelectionRef: "lucemonBuffTarget",
          },
          amount: 3000,
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Lucemon"],
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
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX10-071", compiled);
