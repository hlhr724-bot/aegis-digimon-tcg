import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Until the end of your opponent’s turn, your opponent’s Digimon with play costs of 7 or less can’t attack players, and cards can’t be added to security stacks by your opponent’s effects.",
          kind: "Restrict",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              playCostLte: 7,
            },
            count: "all",
          },
          restriction: "attackPlayers",
          whileMatchesTargetFilter: true,
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] Until the end of your opponent’s turn, your opponent’s Digimon with play costs of 7 or less can’t attack players, and cards can’t be added to security stacks by your opponent’s effects.",
          kind: "GlobalRestrict",
          restriction: "opponentCannotAddToSecurity",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "ActivateMain",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT9-103", compiled);
