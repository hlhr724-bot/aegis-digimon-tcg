import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] 1 of your opponent's Digimon gets -3000 DP and ＜Security Attack -1＞ (This Digimon checks 1 fewer security card) until the end of your opponent's next turn.",
          kind: "SelectBind",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
            bindAs: "bifrostTarget",
          },
        },
        {
          effectTextPart:
            "[Main] 1 of your opponent's Digimon gets -3000 DP and ＜Security Attack -1＞ (This Digimon checks 1 fewer security card) until the end of your opponent's next turn.",
          kind: "ModifyDP",
          target: {
            filter: {},
            count: 1,
            fromSelectionRef: "bifrostTarget",
          },
          amount: -3000,
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] 1 of your opponent's Digimon gets -3000 DP and ＜Security Attack -1＞ (This Digimon checks 1 fewer security card) until the end of your opponent's next turn.",
          kind: "GainKeyword",
          target: {
            filter: {},
            count: 1,
            fromSelectionRef: "bifrostTarget",
          },
          keyword: {
            keyword: "SecurityAttack",
            amount: -1,
            raw: "＜Security Attack -1＞",
          },
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "SelectBind",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
            bindAs: "bifrostTarget",
          },
        },
        {
          kind: "ModifyDP",
          target: {
            filter: {},
            count: 1,
            fromSelectionRef: "bifrostTarget",
          },
          amount: -3000,
          duration: "forTheTurn",
        },
        {
          kind: "GainKeyword",
          target: {
            filter: {},
            count: 1,
            fromSelectionRef: "bifrostTarget",
          },
          keyword: {
            keyword: "SecurityAttack",
            amount: -1,
            raw: "＜Security Attack -1＞",
          },
          duration: "forTheTurn",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT3-101", compiled);
