import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "Replacement",
          event: "wouldBePlayed",
          sourceFilter: { controllerDefault: "mine" },
          actions: [
            {
              kind: "Replacement",
              event: "wouldBePlayed",
              mode: "reduceCost",
              amount: 1,
              raw: "reduce the cost by 1",
              condition: {
                kind: "youHave",
                filter: { zone: "battleArea", controllerDefault: "mine", kind: ["Tamer"], colors: ["Yellow"] },
                raw: "you have a yellow Tamer in play",
              },
            },
          ],
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] 1 of your opponent's Digimon gets -8000 DP until the end of their turn.",
          kind: "ModifyDP",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: -8000,
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT11-100", compiled);
