import type { CompiledCard, Condition } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const multicolorCondition: Condition = {
  kind: "anyOf",
  conditions: [
    {
      kind: "youHave",
      filter: { zone: "battleArea", kind: ["Digimon"], multicolor: true },
    },
    {
      kind: "youHave",
      filter: { zone: "digivolutionCards", multicolor: true, hostFilter: { kind: ["Digimon"] } },
    },
  ],
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] 1 of your opponent's Digimon gets -3000 DP for the turn. If you have a Digimon in play with 2 or more colors, or with 2 or more colors in one of its digivolution cards, 1 of your opponent's Digimon gets -6000 DP instead.",
          kind: "SelectBind",
          target: {
            filter: { controller: "opponent", kind: ["Digimon"] },
            count: 1,
            bindAs: "target",
          },
        },
        {
          effectTextPart:
            "[Main] 1 of your opponent's Digimon gets -3000 DP for the turn. If you have a Digimon in play with 2 or more colors, or with 2 or more colors in one of its digivolution cards, 1 of your opponent's Digimon gets -6000 DP instead.",
          kind: "ModifyDP",
          target: { filter: {}, count: 1, fromSelectionRef: "target" },
          amount: -3000,
          duration: "forTheTurn",
          condition: { kind: "not", condition: multicolorCondition },
        },
        {
          effectTextPart:
            "[Main] 1 of your opponent's Digimon gets -3000 DP for the turn. If you have a Digimon in play with 2 or more colors, or with 2 or more colors in one of its digivolution cards, 1 of your opponent's Digimon gets -6000 DP instead.",
          kind: "ModifyDP",
          target: { filter: {}, count: 1, fromSelectionRef: "target" },
          amount: -6000,
          duration: "forTheTurn",
          condition: multicolorCondition,
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

registerIrCard("BT8-100", compiled);
