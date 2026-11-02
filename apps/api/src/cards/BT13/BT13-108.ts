import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Until the end of your opponent's turn, 1 of your Digimon gains \"[Opponent's Turn] When this Digimon becomes suspended, delete all of your opponent's Digimon with a play cost less than or equal to this Digimon's\" and \"[Opponent's Turn] This Digimon isn't affected by your opponent's Option cards.\"",
          kind: "GrantAuraToOpponents",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
          effectText:
            "[Opponent's Turn] When this Digimon becomes suspended, delete all of your opponent's Digimon with a play cost less than or equal to this Digimon's",
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] Until the end of your opponent's turn, 1 of your Digimon gains \"[Opponent's Turn] When this Digimon becomes suspended, delete all of your opponent's Digimon with a play cost less than or equal to this Digimon's\" and \"[Opponent's Turn] This Digimon isn't affected by your opponent's Option cards.\"",
          kind: "GrantAuraToOpponents",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1, sameTarget: true },
          effectText: "[Opponent's Turn] This Digimon isn't affected by your opponent's Option cards.",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              superlative: "lowestPlayCost",
            },
            count: 1,
          },
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT13-108", compiled);
