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
                filter: { zone: "battleArea", controllerDefault: "mine", kind: ["Tamer"], colors: ["Black"] },
                raw: "you have a black Tamer in play",
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
            "[Main] Until the end of your opponent's turn, 1 of your Digimon with [Numemon], [Sukamon], [Nanimon], or [Etemon] in its name can't be blocked and gains \"[On Deletion] Gain 3 memory.\"",
          kind: "GrantAuraToOpponents",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                { tokens: ["Numemon", "Sukamon", "Nanimon"], match: "name" },
                { tokens: ["Etemon"], match: "name" },
              ],
            },
            count: 1,
          },
          effectText: "[On Deletion] Gain 3 memory.",
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] Until the end of your opponent's turn, 1 of your Digimon with [Numemon], [Sukamon], [Nanimon], or [Etemon] in its name can't be blocked and gains \"[On Deletion] Gain 3 memory.\"",
          kind: "Restrict",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                { tokens: ["Numemon", "Sukamon", "Nanimon"], match: "name" },
                { tokens: ["Etemon"], match: "name" },
              ],
            },
            count: 1,
            sameTarget: true,
          },
          restriction: "cantBeBlocked",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              filter: { controllerDefault: "mine", kind: ["Digimon"], colors: ["Black"], playCostLte: 3 },
              count: 1,
              to: "play",
              optional: true,
            },
          ],
          rest: "trash",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT11-106", compiled);
