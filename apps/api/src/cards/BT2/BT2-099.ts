import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "Replacement",
          event: "wouldBePlayed",
          mode: "reduceCost",
          amount: 1,
          whileInHand: true,
          raw: "Reduce the memory cost of this card in your hand by 1",
          scaling: {
            per: 1,
            filter: {
              zone: "battleArea",
              controller: "mine",
              kind: ["Tamer"],
              colors: ["Yellow"],
            },
            unit: "cards",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] 1 of your opponent's Digimon gets -12000 DP for the turn.",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: -12000,
          duration: "forTheTurn",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT2-099", compiled);
