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
                filter: { zone: "battleArea", controllerDefault: "mine", kind: ["Tamer"], colors: ["Green"] },
                raw: "you have a green Tamer in play",
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
          effectTextPart:
            '[Main] Until the end of your opponent\'s turn, all of their Digimon gain "[All Turns] When this Digimon becomes suspended, lose 1 memory."',
          kind: "GrantAuraToOpponents",
          includeLaterEntrants: true,
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: "all" },
          event: "whenSuspended",
          actions: [{ kind: "GainMemory", amount: -1 }],
          effectText: "[All Turns] When this Digimon becomes suspended, lose 1 memory.",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT11-103", compiled);
