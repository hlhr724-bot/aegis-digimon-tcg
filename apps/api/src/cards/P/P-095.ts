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
            "[Main] 1 of your opponent's Digimon gets -6000 DP and cannot activate its [When Digivolving] effects until the end of your opponent's turn.",
          kind: "SelectBind",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
            bindAs: "P095Target",
          },
        },
        {
          effectTextPart:
            "[Main] 1 of your opponent's Digimon gets -6000 DP and cannot activate its [When Digivolving] effects until the end of your opponent's turn.",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            fromSelectionRef: "P095Target",
            count: 1,
          },
          amount: -6000,
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] 1 of your opponent's Digimon gets -6000 DP and cannot activate its [When Digivolving] effects until the end of your opponent's turn.",
          kind: "DisableTimingEffect",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            fromSelectionRef: "P095Target",
            count: 1,
          },
          timings: ["whenDigivolving"],
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          effectTextPart: "[Security] 1 of your opponent's Digimon gets -6000 DP until the end of this turn.",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: -6000,
          duration: "forTheTurn",
        },
        {
          kind: "AddToHandSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("P-095", compiled);
